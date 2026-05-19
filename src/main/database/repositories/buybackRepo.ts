import { getDb } from '../index'

export type BuybackStatus = 'received' | 'inspecting' | 'refurbishing' | 'ready' | 'sold' | 'scrapped'
export type ConditionGrade = 'A' | 'B' | 'C' | 'D' | 'broken'

export interface BuybackRow {
  id: number
  customer_id: number | null
  device_type: string
  brand: string | null
  model: string | null
  serial_number: string | null
  condition_grade: ConditionGrade
  buyback_price: number
  status: BuybackStatus
  job_card_id: number | null
  product_id: number | null
  resale_price: number | null
  sold_at: string | null
  notes: string | null
  received_by: number | null
  created_at: string
  updated_at: string
  // joined
  customer_name?: string | null
  receiver_name?: string | null
}

export interface BuybackFilters {
  search?: string
  status?: BuybackStatus
  page?: number
  pageSize?: number
}

export const buybackRepo = {
  list(filters: BuybackFilters = {}): { items: BuybackRow[]; total: number } {
    const { search = '', status, page = 1, pageSize = 25 } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(b.device_type LIKE ? OR b.brand LIKE ? OR b.model LIKE ? OR b.serial_number LIKE ? OR c.name LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like, like, like)
    }
    if (status) { conditions.push('b.status = ?'); params.push(status) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const total = (getDb().prepare(`
      SELECT COUNT(*) as cnt
      FROM buybacks b LEFT JOIN customers c ON c.id = b.customer_id ${where}
    `).get(...params) as { cnt: number }).cnt

    const items = getDb().prepare(`
      SELECT b.*, c.name as customer_name, u.full_name as receiver_name
      FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN users u ON u.id = b.received_by
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as BuybackRow[]

    return { items, total }
  },

  getById(id: number): BuybackRow | null {
    return getDb().prepare(`
      SELECT b.*, c.name as customer_name, u.full_name as receiver_name
      FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN users u ON u.id = b.received_by
      WHERE b.id = ?
    `).get(id) as BuybackRow | null
  },

  create(data: {
    customer_id?: number | null
    device_type: string
    brand?: string | null
    model?: string | null
    serial_number?: string | null
    condition_grade?: ConditionGrade
    buyback_price?: number
    notes?: string | null
    received_by?: number | null
  }): number {
    const result = getDb().prepare(`
      INSERT INTO buybacks (customer_id, device_type, brand, model, serial_number,
        condition_grade, buyback_price, notes, received_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.customer_id ?? null,
      data.device_type,
      data.brand ?? null,
      data.model ?? null,
      data.serial_number ?? null,
      data.condition_grade ?? 'C',
      data.buyback_price ?? 0,
      data.notes ?? null,
      data.received_by ?? null,
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Pick<BuybackRow,
    'customer_id' | 'device_type' | 'brand' | 'model' | 'serial_number' |
    'condition_grade' | 'buyback_price' | 'status' | 'job_card_id' |
    'product_id' | 'resale_price' | 'notes'
  >>): void {
    const ALLOWED = new Set([
      'customer_id', 'device_type', 'brand', 'model', 'serial_number',
      'condition_grade', 'buyback_price', 'status', 'job_card_id',
      'product_id', 'resale_price', 'notes',
    ])
    const entries = Object.entries(data).filter(([k]) => ALLOWED.has(k))
    if (!entries.length) return
    const fields = entries.map(([k]) => `${k} = ?`).join(', ')
    getDb().prepare(`UPDATE buybacks SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...entries.map(([, v]) => v), id)
  },

  /**
   * Mark as sold: records resale price and timestamp.
   */
  markSold(id: number, resalePrice: number): void {
    getDb().prepare(`
      UPDATE buybacks SET status = 'sold', resale_price = ?, sold_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(resalePrice, id)
  },

  /**
   * Promote to inventory: creates a product record for this refurbished device.
   * Returns the new product_id.
   */
  promoteToInventory(id: number, productData: {
    name: string
    sell_price: number
    cost_price: number
    category_id?: number | null
  }): number {
    const db = getDb()
    const txn = db.transaction(() => {
      const buyback = db.prepare(`SELECT * FROM buybacks WHERE id = ?`).get(id) as BuybackRow | undefined
      if (!buyback) throw new Error('Buyback not found')
      if (!['inspecting', 'refurbishing', 'ready'].includes(buyback.status)) {
        throw new Error('Buyback must be inspecting/refurbishing/ready to promote to inventory')
      }
      const prodResult = db.prepare(`
        INSERT INTO products (name, cost_price, sell_price, stock_quantity, low_stock_threshold,
          unit, is_active, category_id, description)
        VALUES (?, ?, ?, 1, 1, 'unit', 1, ?, ?)
      `).run(
        productData.name,
        productData.cost_price,
        productData.sell_price,
        productData.category_id ?? null,
        `Refurbished ${buyback.device_type} – ${buyback.brand ?? ''} ${buyback.model ?? ''}`.trim(),
      )
      const productId = prodResult.lastInsertRowid as number
      db.prepare(`
        UPDATE buybacks SET status = 'ready', product_id = ?, updated_at = datetime('now') WHERE id = ?
      `).run(productId, id)
      return productId
    })
    return txn() as number
  },

  delete(id: number): void {
    getDb().prepare(`DELETE FROM buybacks WHERE id = ? AND status IN ('received','scrapped')`).run(id)
  },
}
