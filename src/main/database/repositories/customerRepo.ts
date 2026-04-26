import { getDb } from '../index'

export interface CustomerRow {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  balance: number
  /** Sum of unpaid sale balance_due + unpaid job balance_due (for list/debt UI). */
  amount_owed?: number
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
  /** Actual cash received: amount_paid from sales + (total - balance_due) from job cards. */
  total_paid: number
  /** Count of non-void sales (excl. draft) + non-cancelled job cards for this owner. */
  total_visits: number
  /** Sum of unpaid POS sale balance_due + unpaid job_cards balance_due for this customer. */
  outstanding_balance: number
  /** ISO date string of the most recent sale or job card (excluding voided/cancelled). */
  last_visit: string | null
}

export const customerRepo = {
  findByPhone(phone: string): Pick<CustomerRow, 'id' | 'name' | 'phone'> | undefined {
    const input = phone.trim()
    if (!input) return undefined
    const digitsOnly = input.replace(/\D/g, '')
    const phoneNorm = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`
    if (digitsOnly.length >= 2) {
      return getDb().prepare(`
        SELECT id, name, phone FROM customers
        WHERE (${phoneNorm}) = ?
        LIMIT 1
      `).get(digitsOnly) as Pick<CustomerRow, 'id' | 'name' | 'phone'> | undefined
    }
    return getDb().prepare(`
      SELECT id, name, phone FROM customers
      WHERE phone = ?
      LIMIT 1
    `).get(input) as Pick<CustomerRow, 'id' | 'name' | 'phone'> | undefined
  },

  list(filters: CustomerFilters = {}): { items: CustomerRow[]; total: number } {
    const { search = '', with_debt = false, page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: (string | number)[] = []

    if (search) {
      const like = `%${search}%`
      const digitsOnly = search.replace(/\D/g, '')
      /** Match stored phones regardless of spaces/dashes/+ when user types numbers (quick job, POS lookup). */
      const phoneNormSql = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(c.phone,''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`
      if (digitsOnly.length >= 2) {
        const digitLike = `%${digitsOnly}%`
        conditions.push(`(
          c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
          OR (${phoneNormSql} LIKE ?)
        )`)
        params.push(like, like, like, digitLike)
      } else {
        conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)')
        params.push(like, like, like)
      }
    }
    if (with_debt) {
      conditions.push(`(
        c.balance < 0
        OR EXISTS (
          SELECT 1 FROM sales s
          WHERE s.customer_id = c.id AND s.status NOT IN ('draft','voided') AND COALESCE(s.balance_due, 0) > 0.0001
        )
        OR EXISTS (
          SELECT 1 FROM job_cards j
          WHERE j.owner_id = c.id AND j.status != 'cancelled' AND COALESCE(j.balance_due, 0) > 0.0001
        )
      )`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (getDb().prepare(`SELECT COUNT(*) as cnt FROM customers c ${where}`).get(...params) as { cnt: number }).cnt

    const items = getDb().prepare(`
      SELECT c.*,
        COUNT(DISTINCT s.id) as sale_count,
        COUNT(DISTINCT r.id) as repair_count,
        (
          (SELECT COALESCE(SUM(s2.balance_due), 0) FROM sales s2
            WHERE s2.customer_id = c.id AND s2.status NOT IN ('draft', 'voided'))
          + (SELECT COALESCE(SUM(j2.balance_due), 0) FROM job_cards j2
            WHERE j2.owner_id = c.id AND j2.status != 'cancelled')
        ) AS amount_owed
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
    const digitsOnly = query.replace(/\D/g, '')
    const phoneNorm = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')`
    if (digitsOnly.length >= 2) {
      const digitLike = `%${digitsOnly}%`
      return getDb().prepare(`
        SELECT id, name, phone, balance FROM customers
        WHERE name LIKE ? OR phone LIKE ? OR (${phoneNorm} LIKE ?)
        ORDER BY name LIMIT 10
      `).all(like, like, digitLike) as Pick<CustomerRow, 'id' | 'name' | 'phone' | 'balance'>[]
    }
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
    /** True AR: unpaid POS + unpaid job cards (job debt is not mirrored on customers.balance). */
    const salesOwed = (db.prepare(`
      SELECT COALESCE(SUM(balance_due), 0) AS v
      FROM sales
      WHERE customer_id = ? AND status NOT IN ('draft', 'voided')
    `).get(customerId) as { v: number }).v
    const jobsOwed = (db.prepare(`
      SELECT COALESCE(SUM(balance_due), 0) AS v
      FROM job_cards
      WHERE owner_id = ? AND status != 'cancelled'
    `).get(customerId) as { v: number }).v
    const outstanding_balance = salesOwed + jobsOwed

    const sales = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('completed', 'partial') THEN total_amount ELSE 0 END), 0) AS spent,
        COALESCE(SUM(CASE WHEN status NOT IN ('draft', 'voided') THEN amount_paid ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status NOT IN ('draft', 'voided') THEN 1 ELSE 0 END), 0) AS visits
      FROM sales WHERE customer_id = ?
    `).get(customerId) as { spent: number; paid: number; visits: number } | undefined

    const jobs = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) AS spent,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN
          CASE WHEN balance_due IS NOT NULL AND balance_due > 0 THEN total - balance_due ELSE total END
        ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END), 0) AS visits
      FROM job_cards WHERE owner_id = ?
    `).get(customerId) as { spent: number; paid: number; visits: number } | undefined

    const lastVisitRow = db.prepare(`
      SELECT MAX(d) as last_visit FROM (
        SELECT MAX(created_at) as d FROM sales
          WHERE customer_id = ? AND status NOT IN ('draft', 'voided')
        UNION ALL
        SELECT MAX(created_at) as d FROM job_cards
          WHERE owner_id = ? AND status != 'cancelled'
      )
    `).get(customerId, customerId) as { last_visit: string | null } | undefined

    return {
      total_spent: (sales?.spent ?? 0) + (jobs?.spent ?? 0),
      total_paid:  (sales?.paid  ?? 0) + (jobs?.paid  ?? 0),
      total_visits: (sales?.visits ?? 0) + (jobs?.visits ?? 0),
      outstanding_balance,
      last_visit: lastVisitRow?.last_visit ?? null,
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
