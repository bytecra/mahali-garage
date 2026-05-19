import { getDb } from '../index'

export interface ReservationRow {
  id: number
  job_card_id: number
  product_id: number
  quantity: number
  status: 'active' | 'consumed' | 'released'
  reserved_by: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  product_name?: string
  product_sku?: string | null
  job_number?: string | null
  reserver_name?: string | null
}

export const reservationRepo = {
  listByJob(jobCardId: number): ReservationRow[] {
    return getDb().prepare(`
      SELECT r.*, p.name as product_name, p.sku as product_sku,
             u.full_name as reserver_name
      FROM stock_reservations r
      JOIN products p ON p.id = r.product_id
      LEFT JOIN users u ON u.id = r.reserved_by
      WHERE r.job_card_id = ?
      ORDER BY r.created_at DESC
    `).all(jobCardId) as ReservationRow[]
  },

  listByProduct(productId: number): ReservationRow[] {
    return getDb().prepare(`
      SELECT r.*, p.name as product_name, jc.job_number,
             u.full_name as reserver_name
      FROM stock_reservations r
      JOIN products p ON p.id = r.product_id
      LEFT JOIN job_cards jc ON jc.id = r.job_card_id
      LEFT JOIN users u ON u.id = r.reserved_by
      WHERE r.product_id = ? AND r.status = 'active'
      ORDER BY r.created_at DESC
    `).all(productId) as ReservationRow[]
  },

  /** Total quantity actively reserved for a product (used by POS stock check). */
  reservedQuantity(productId: number): number {
    const row = getDb().prepare(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM stock_reservations
      WHERE product_id = ? AND status = 'active'
    `).get(productId) as { total: number }
    return row.total
  },

  create(data: {
    job_card_id: number
    product_id: number
    quantity: number
    reserved_by: number | null
    notes?: string | null
  }): number {
    const db = getDb()
    const txn = db.transaction(() => {
      const product = db.prepare(
        'SELECT stock_quantity FROM products WHERE id = ?'
      ).get(data.product_id) as { stock_quantity: number } | undefined
      if (!product) throw new Error('Product not found')

      const alreadyReserved = (db.prepare(
        `SELECT COALESCE(SUM(quantity),0) as total FROM stock_reservations WHERE product_id = ? AND status = 'active'`
      ).get(data.product_id) as { total: number }).total

      const available = product.stock_quantity - alreadyReserved
      if (available < data.quantity) {
        throw new Error(
          `Insufficient available stock: have ${available} available (${product.stock_quantity} total, ${alreadyReserved} reserved)`
        )
      }

      const result = db.prepare(`
        INSERT INTO stock_reservations (job_card_id, product_id, quantity, reserved_by, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.job_card_id, data.product_id, data.quantity, data.reserved_by ?? null, data.notes ?? null)

      return result.lastInsertRowid as number
    })
    return txn() as number
  },

  consume(id: number): void {
    getDb().prepare(`
      UPDATE stock_reservations SET status = 'consumed', updated_at = datetime('now') WHERE id = ? AND status = 'active'
    `).run(id)
  },

  release(id: number): void {
    getDb().prepare(`
      UPDATE stock_reservations SET status = 'released', updated_at = datetime('now') WHERE id = ? AND status = 'active'
    `).run(id)
  },

  releaseAllForJob(jobCardId: number): void {
    getDb().prepare(`
      UPDATE stock_reservations SET status = 'released', updated_at = datetime('now')
      WHERE job_card_id = ? AND status = 'active'
    `).run(jobCardId)
  },
}
