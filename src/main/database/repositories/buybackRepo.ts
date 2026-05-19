import { getDb } from '../index'

export type BuybackStatus = 'received' | 'inspecting' | 'refurbishing' | 'ready' | 'sold' | 'scrapped'
export type ConditionGrade = 'A' | 'B' | 'C' | 'D' | 'broken'

export interface BuybackRow {
  id: number
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
  customer_id: number | null
  sold_to_customer_id: number | null
  // joined
  sold_to_customer_name?: string
  notes: string | null
  sold_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  // specs
  storage: string | null
  ram: string | null
  color: string | null
  imei: string | null
  battery_health: number | null
  accessories: string | null
  // joined
  customer_name?: string
}

export interface BuybackFilters {
  search?: string
  status?: BuybackStatus
  page?: number
  pageSize?: number
}

export interface BuybackCreateInput {
  device_type: string
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  condition_grade?: ConditionGrade
  buyback_price?: number
  customer_id?: number | null
  notes?: string | null
  storage?: string | null
  ram?: string | null
  color?: string | null
  imei?: string | null
  battery_health?: number | null
  accessories?: string | null
}

export const buybackRepo = {
  list(filters: BuybackFilters = {}): { items: BuybackRow[]; total: number } {
    const db = getDb()
    const { search = '', status, page = 1, pageSize = 25 } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (status) { conditions.push('b.status = ?'); params.push(status) }
    if (search) {
      conditions.push('(b.device_type LIKE ? OR b.brand LIKE ? OR b.model LIKE ? OR b.serial_number LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const rows = db.prepare(`
      SELECT b.*,
        c.name AS customer_name,
        sc.name AS sold_to_customer_name
      FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN customers sc ON sc.id = b.sold_to_customer_id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as BuybackRow[]

    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN customers sc ON sc.id = b.sold_to_customer_id
      ${where}
    `).get(...params) as { total: number }

    return { items: rows, total }
  },

  getById(id: number): BuybackRow | undefined {
    return getDb().prepare(`
      SELECT b.*,
        c.name AS customer_name,
        sc.name AS sold_to_customer_name
      FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN customers sc ON sc.id = b.sold_to_customer_id
      WHERE b.id = ?
    `).get(id) as BuybackRow | undefined
  },

  create(data: BuybackCreateInput, userId: number): number {
    const result = getDb().prepare(`
      INSERT INTO buybacks
        (device_type, brand, model, serial_number, condition_grade, buyback_price, customer_id, notes,
         storage, ram, color, imei, battery_health, accessories, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.device_type,
      data.brand ?? null,
      data.model ?? null,
      data.serial_number ?? null,
      data.condition_grade ?? 'C',
      data.buyback_price ?? 0,
      data.customer_id ?? null,
      data.notes ?? null,
      data.storage ?? null,
      data.ram ?? null,
      data.color ?? null,
      data.imei ?? null,
      data.battery_health ?? null,
      data.accessories ?? null,
      userId,
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Pick<BuybackRow, 'status' | 'condition_grade' | 'resale_price' | 'notes' | 'customer_id' | 'sold_to_customer_id' | 'storage' | 'ram' | 'color' | 'imei' | 'battery_health' | 'accessories'>>): void {
    const ALLOWED: Set<string> = new Set(['status', 'condition_grade', 'resale_price', 'notes', 'customer_id', 'sold_to_customer_id', 'storage', 'ram', 'color', 'imei', 'battery_health', 'accessories'])
    const entries = Object.entries(data).filter(([k]) => ALLOWED.has(k))
    if (!entries.length) return
    const extraCols: string[] = []
    if (data.status === 'sold') extraCols.push(`sold_at = datetime('now')`)
    const allFields = [...entries.map(([k]) => `${k} = ?`), ...extraCols, `updated_at = datetime('now')`].join(', ')
    getDb().prepare(`UPDATE buybacks SET ${allFields} WHERE id = ?`).run(...entries.map(([, v]) => v), id)
  },

  /** Create a product record from this refurbished buyback so it can be sold through POS. */
  promoteToInventory(id: number, productData: {
    name: string
    sku?: string | null
    sell_price: number
    cost_price?: number
    category_id?: number | null
  }): number {
    const db = getDb()
    return db.transaction(() => {
      const buyback = db.prepare(`SELECT * FROM buybacks WHERE id = ?`).get(id) as BuybackRow | undefined
      if (!buyback) throw new Error('Buyback not found')
      if (buyback.status !== 'ready') throw new Error('Only ready devices can be added to inventory')

      const result = db.prepare(`
        INSERT INTO products (name, sku, sell_price, cost_price, stock_quantity, category_id, is_active, description)
        VALUES (?, ?, ?, ?, 1, ?, 1, ?)
      `).run(
        productData.name,
        productData.sku ?? null,
        productData.sell_price,
        productData.cost_price ?? buyback.buyback_price,
        productData.category_id ?? null,
        `Refurbished ${buyback.device_type}${buyback.model ? ' ' + buyback.model : ''}`,
      )
      const productId = result.lastInsertRowid as number

      db.prepare(`
        UPDATE buybacks SET product_id = ?, resale_price = ?, updated_at = datetime('now') WHERE id = ?
      `).run(productId, productData.sell_price, id)

      return productId
    })()
  },

  listByCustomer(customerId: number): { boughtFrom: BuybackRow[]; soldTo: BuybackRow[] } {
    const db = getDb()
    const base = `
      SELECT b.*, c.name AS customer_name, sc.name AS sold_to_customer_name
      FROM buybacks b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN customers sc ON sc.id = b.sold_to_customer_id
    `
    const boughtFrom = db.prepare(`${base} WHERE b.customer_id = ? ORDER BY b.created_at DESC`).all(customerId) as BuybackRow[]
    const soldTo = db.prepare(`${base} WHERE b.sold_to_customer_id = ? ORDER BY b.sold_at DESC`).all(customerId) as BuybackRow[]
    return { boughtFrom, soldTo }
  },

  delete(id: number): void {
    getDb().prepare(`DELETE FROM buybacks WHERE id = ?`).run(id)
  },
}
