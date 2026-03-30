import { getDb } from '../index'

export interface CustomerRow {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  balance: number
  created_at: string
  updated_at: string
  sale_count?: number
  repair_count?: number
}

export interface CustomerFilters {
  search?: string
  with_debt?: boolean
  page?: number
  pageSize?: number
}

/** Lifetime stats for customer profile (no extra tables). */
export interface CustomerSummaryStats {
  /** Completed/partial POS sales + delivered job card totals. */
  total_spent: number
  /** Count of non-void sales (excl. draft) + non-cancelled job cards for this owner. */
  total_visits: number
  /** Amount customer owes (positive number); mirrors UI when balance is negative. */
  outstanding_balance: number
}

export const customerRepo = {
  list(filters: CustomerFilters = {}): { items: CustomerRow[]; total: number } {
    const { search = '', with_debt = false, page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (search) {
      conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like)
    }
    if (with_debt) {
      conditions.push('c.balance < 0')
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (getDb().prepare(`SELECT COUNT(*) as cnt FROM customers c ${where}`).get(...params) as { cnt: number }).cnt

    const items = getDb().prepare(`
      SELECT c.*,
        COUNT(DISTINCT s.id) as sale_count,
        COUNT(DISTINCT r.id) as repair_count
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'draft'
      LEFT JOIN repairs r ON r.customer_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.name
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as CustomerRow[]

    return { items, total }
  },

  search(query: string): Pick<CustomerRow, 'id' | 'name' | 'phone' | 'balance'>[] {
    const like = `%${query}%`
    return getDb().prepare(`
      SELECT id, name, phone, balance FROM customers
      WHERE name LIKE ? OR phone LIKE ?
      ORDER BY name LIMIT 10
    `).all(like, like) as Pick<CustomerRow, 'id' | 'name' | 'phone' | 'balance'>[]
  },

  findById(id: number): CustomerRow | undefined {
    return getDb().prepare(`
      SELECT c.*,
        COUNT(DISTINCT s.id) as sale_count,
        COUNT(DISTINCT r.id) as repair_count
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'draft'
      LEFT JOIN repairs r ON r.customer_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as CustomerRow | undefined
  },

  getSalesHistory(customerId: number): unknown[] {
    return getDb().prepare(`
      SELECT s.id, s.sale_number, s.total_amount, s.amount_paid, s.balance_due, s.status, s.created_at,
             i.invoice_number
      FROM sales s
      LEFT JOIN invoices i ON i.sale_id = s.id
      WHERE s.customer_id = ? AND s.status != 'draft'
      ORDER BY s.created_at DESC
      LIMIT 20
    `).all(customerId)
  },

  getRepairHistory(customerId: number): unknown[] {
    return getDb().prepare(`
      SELECT r.id, r.job_number, r.type, r.status, r.priority, r.device_type, r.device_brand,
             r.final_cost, r.deposit_paid, r.created_at, u.full_name as technician_name
      FROM repairs r
      LEFT JOIN users u ON u.id = r.technician_id
      WHERE r.customer_id = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(customerId)
  },

  getSummaryStats(customerId: number): CustomerSummaryStats {
    const db = getDb()
    const row = db.prepare('SELECT balance FROM customers WHERE id = ?').get(customerId) as { balance: number } | undefined
    const balance = row?.balance ?? 0
    const outstanding_balance = balance < 0 ? Math.abs(balance) : 0

    const sales = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('completed', 'partial') THEN total_amount ELSE 0 END), 0) AS spent,
        COALESCE(SUM(CASE WHEN status NOT IN ('draft', 'voided') THEN 1 ELSE 0 END), 0) AS visits
      FROM sales WHERE customer_id = ?
    `).get(customerId) as { spent: number; visits: number } | undefined

    const jobs = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) AS spent,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END), 0) AS visits
      FROM job_cards WHERE owner_id = ?
    `).get(customerId) as { spent: number; visits: number } | undefined

    return {
      total_spent: (sales?.spent ?? 0) + (jobs?.spent ?? 0),
      total_visits: (sales?.visits ?? 0) + (jobs?.visits ?? 0),
      outstanding_balance,
    }
  },

  create(data: Omit<CustomerRow, 'id' | 'created_at' | 'updated_at' | 'sale_count' | 'repair_count'>): number {
    const result = getDb().prepare(`
      INSERT INTO customers (name, phone, email, address, notes, balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.name, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, data.balance ?? 0)
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Omit<CustomerRow, 'id' | 'created_at' | 'updated_at' | 'sale_count' | 'repair_count'>>): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`UPDATE customers SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(data), id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM customers WHERE id = ?').run(id)
  },

  adjustBalance(id: number, delta: number): void {
    getDb().prepare(`
      UPDATE customers SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?
    `).run(delta, id)
  },
}
