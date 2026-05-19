import { getDb } from '../index'

export interface BuildRow {
  id: number
  name: string
  status: 'draft' | 'reserved' | 'assembling' | 'complete' | 'sold' | 'cancelled'
  customer_id: number | null
  sale_id: number | null
  sell_price: number
  notes: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  // joined
  customer_name?: string | null
  creator_name?: string | null
  total_cost?: number
  item_count?: number
}

export interface BuildItemRow {
  id: number
  build_id: number
  product_id: number
  product_name: string
  quantity: number
  unit_cost: number
  created_at: string
  // joined
  product_sku?: string | null
  stock_quantity?: number
}

export interface BuildFilters {
  search?: string
  status?: string
  page?: number
  pageSize?: number
}

export const buildRepo = {
  list(filters: BuildFilters = {}): { items: BuildRow[]; total: number } {
    const { search = '', status, page = 1, pageSize = 25 } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(b.name LIKE ? OR c.name LIKE ?)')
      const like = `%${search}%`
      params.push(like, like)
    }
    if (status) { conditions.push('b.status = ?'); params.push(status) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const total = (getDb().prepare(`
      SELECT COUNT(*) as cnt FROM builds b LEFT JOIN customers c ON c.id = b.customer_id ${where}
    `).get(...params) as { cnt: number }).cnt

    const items = getDb().prepare(`
      SELECT b.*, c.name as customer_name, u.full_name as creator_name,
             COALESCE((SELECT SUM(bi.quantity * bi.unit_cost) FROM build_items bi WHERE bi.build_id = b.id), 0) as total_cost,
             COALESCE((SELECT COUNT(*) FROM build_items bi WHERE bi.build_id = b.id), 0) as item_count
      FROM builds b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN users u ON u.id = b.created_by
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as BuildRow[]

    return { items, total }
  },

  getById(id: number): (BuildRow & { items: BuildItemRow[] }) | null {
    const build = getDb().prepare(`
      SELECT b.*, c.name as customer_name, u.full_name as creator_name
      FROM builds b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.id = ?
    `).get(id) as BuildRow | undefined
    if (!build) return null
    const items = getDb().prepare(`
      SELECT bi.*, p.sku as product_sku, p.stock_quantity
      FROM build_items bi
      JOIN products p ON p.id = bi.product_id
      WHERE bi.build_id = ?
      ORDER BY bi.id
    `).all(id) as BuildItemRow[]
    return { ...build, items }
  },

  create(data: {
    name: string
    customer_id?: number | null
    sell_price?: number
    notes?: string | null
    created_by?: number | null
    items: Array<{ product_id: number; product_name: string; quantity: number; unit_cost: number }>
  }): number {
    const db = getDb()
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO builds (name, customer_id, sell_price, notes, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.name, data.customer_id ?? null, data.sell_price ?? 0, data.notes ?? null, data.created_by ?? null)
      const buildId = result.lastInsertRowid as number
      for (const item of data.items) {
        db.prepare(`
          INSERT INTO build_items (build_id, product_id, product_name, quantity, unit_cost)
          VALUES (?, ?, ?, ?, ?)
        `).run(buildId, item.product_id, item.product_name, item.quantity, item.unit_cost)
      }
      return buildId
    })
    return txn() as number
  },

  update(id: number, data: Partial<Pick<BuildRow, 'name' | 'status' | 'customer_id' | 'sell_price' | 'notes'>>): void {
    const ALLOWED = new Set(['name', 'status', 'customer_id', 'sell_price', 'notes'])
    const entries = Object.entries(data).filter(([k]) => ALLOWED.has(k))
    if (!entries.length) return
    const fields = entries.map(([k]) => `${k} = ?`).join(', ')
    getDb().prepare(`UPDATE builds SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...entries.map(([, v]) => v), id)
  },

  /**
   * Reserve: deducts stock for all items, sets status = 'reserved'.
   * Throws if any item has insufficient stock.
   */
  reserve(buildId: number, userId: number): void {
    const db = getDb()
    const txn = db.transaction(() => {
      const build = db.prepare(`SELECT status FROM builds WHERE id = ?`).get(buildId) as { status: string } | undefined
      if (!build || build.status !== 'draft') throw new Error('Build must be in draft status to reserve')

      const items = db.prepare(`
        SELECT bi.product_id, bi.quantity, bi.product_name, p.stock_quantity
        FROM build_items bi JOIN products p ON p.id = bi.product_id WHERE bi.build_id = ?
      `).all(buildId) as Array<{ product_id: number; quantity: number; product_name: string; stock_quantity: number }>

      for (const item of items) {
        const alreadyReserved = (db.prepare(
          `SELECT COALESCE(SUM(quantity),0) as total FROM stock_reservations WHERE product_id = ? AND status = 'active'`
        ).get(item.product_id) as { total: number }).total
        const available = item.stock_quantity - alreadyReserved
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for "${item.product_name}": ${available} available, need ${item.quantity}`)
        }
        db.prepare(`
          INSERT INTO stock_reservations (job_card_id, product_id, quantity, reserved_by, notes)
          VALUES (0, ?, ?, ?, ?)
        `).run(item.product_id, item.quantity, userId, `Build #${buildId}`)
      }
      db.prepare(`UPDATE builds SET status = 'reserved', updated_at = datetime('now') WHERE id = ?`).run(buildId)
    })
    txn()
  },

  /**
   * Complete assembly: consumes reserved stock (deducts physically), sets status = 'complete'.
   */
  completeAssembly(buildId: number, userId: number): void {
    const db = getDb()
    const txn = db.transaction(() => {
      const build = db.prepare(`SELECT status FROM builds WHERE id = ?`).get(buildId) as { status: string } | undefined
      if (!build || !['reserved', 'assembling'].includes(build.status)) {
        throw new Error('Build must be reserved or assembling to complete')
      }
      const items = db.prepare(`
        SELECT bi.product_id, bi.quantity, p.stock_quantity
        FROM build_items bi JOIN products p ON p.id = bi.product_id WHERE bi.build_id = ?
      `).all(buildId) as Array<{ product_id: number; quantity: number; stock_quantity: number }>

      for (const item of items) {
        const qtyBefore = item.stock_quantity
        const qtyAfter = qtyBefore - item.quantity
        if (qtyAfter < 0) throw new Error(`Insufficient physical stock for product ${item.product_id}`)
        db.prepare(`UPDATE products SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(qtyAfter, item.product_id)
        db.prepare(`
          INSERT INTO stock_adjustments (product_id, user_id, type, quantity, qty_before, qty_after, reason, reference)
          VALUES (?, ?, 'out', ?, ?, ?, 'build_consumed', ?)
        `).run(item.product_id, userId, item.quantity, qtyBefore, qtyAfter, `Build #${buildId}`)
      }
      // Release the reservations (physical stock already deducted)
      db.prepare(`
        UPDATE stock_reservations SET status = 'consumed', updated_at = datetime('now')
        WHERE notes = ? AND status = 'active'
      `).run(`Build #${buildId}`)
      db.prepare(`UPDATE builds SET status = 'complete', updated_at = datetime('now') WHERE id = ?`).run(buildId)
    })
    txn()
  },

  cancel(buildId: number): void {
    const db = getDb()
    const txn = db.transaction(() => {
      // Release any active reservations
      db.prepare(`
        UPDATE stock_reservations SET status = 'released', updated_at = datetime('now')
        WHERE notes = ? AND status = 'active'
      `).run(`Build #${buildId}`)
      db.prepare(`UPDATE builds SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(buildId)
    })
    txn()
  },

  delete(id: number): void {
    getDb().prepare(`DELETE FROM builds WHERE id = ? AND status IN ('draft','cancelled')`).run(id)
  },
}
