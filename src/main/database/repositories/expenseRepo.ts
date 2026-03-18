import { getDb } from '../index'

export interface ExpenseCategory {
  id: number; name: string; color: string; created_at: string
}

export interface Expense {
  id: number; name: string
  category_id: number | null; category_name: string | null; category_color: string | null
  amount: number; date: string; due_date: string | null; is_paid: number
  branch: string | null; notes: string | null
  user_id: number | null; full_name: string | null
  receipt_path: string | null; created_at: string; updated_at: string
}

export interface UpcomingExpense {
  id: number; name: string; amount: number; due_date: string; is_paid: number
  category_name: string | null; category_color: string | null; is_overdue: number
}

interface ExpenseFilters {
  from?: string; to?: string; category_id?: number; search?: string
  limit?: number; offset?: number
}

interface CreateExpenseInput {
  name: string; category_id?: number | null; amount: number; date: string
  due_date?: string | null; is_paid?: number
  branch?: string | null; notes?: string | null; user_id?: number | null; receipt_path?: string | null
}

export const expenseRepo = {
  // ── Categories ──────────────────────────────────────────────────────────
  listCategories(): ExpenseCategory[] {
    return getDb().prepare('SELECT * FROM expense_categories ORDER BY name').all() as ExpenseCategory[]
  },

  createCategory(data: { name: string; color: string }): number {
    const r = getDb().prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)').run(data.name, data.color)
    return r.lastInsertRowid as number
  },

  updateCategory(id: number, data: { name?: string; color?: string }): void {
    const db = getDb()
    if (data.name  !== undefined) db.prepare('UPDATE expense_categories SET name = ? WHERE id = ?').run(data.name, id)
    if (data.color !== undefined) db.prepare('UPDATE expense_categories SET color = ? WHERE id = ?').run(data.color, id)
  },

  deleteCategory(id: number): void {
    getDb().prepare('DELETE FROM expense_categories WHERE id = ?').run(id)
  },

  // ── Expenses ─────────────────────────────────────────────────────────────
  list(filters: ExpenseFilters = {}): { rows: Expense[]; total: number } {
    const db = getDb()
    const conditions: string[] = []
    const params: (string | number)[] = []
    if (filters.from)        { conditions.push('e.date >= ?');        params.push(filters.from) }
    if (filters.to)          { conditions.push('e.date <= ?');        params.push(filters.to) }
    if (filters.category_id) { conditions.push('e.category_id = ?'); params.push(filters.category_id) }
    if (filters.search)      { conditions.push('e.name LIKE ?');      params.push(`%${filters.search}%`) }
    const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit  = filters.limit  ?? 100
    const offset = filters.offset ?? 0
    const total = (db.prepare(`SELECT COUNT(*) as n FROM expenses e ${where}`).get(...params) as { n: number }).n
    const rows  = db.prepare(`
      SELECT e.*, ec.name as category_name, ec.color as category_color, u.full_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN users u ON u.id = e.user_id
      ${where}
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Expense[]
    return { rows, total }
  },

  getById(id: number): Expense | null {
    return getDb().prepare(`
      SELECT e.*, ec.name as category_name, ec.color as category_color, u.full_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = ?
    `).get(id) as Expense | null
  },

  /**
   * Returns unpaid expenses due within `days` days (including overdue).
   */
  getUpcomingDue(days = 7): UpcomingExpense[] {
    return getDb().prepare(`
      SELECT
        e.id, e.name, e.amount, e.due_date, e.is_paid,
        ec.name  AS category_name,
        ec.color AS category_color,
        CASE WHEN e.due_date < date('now') THEN 1 ELSE 0 END AS is_overdue
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.due_date IS NOT NULL
        AND e.is_paid = 0
        AND e.due_date <= date('now', '+' || ? || ' days')
      ORDER BY e.due_date ASC
    `).all(days) as UpcomingExpense[]
  },

  markPaid(id: number): void {
    getDb().prepare(
      `UPDATE expenses SET is_paid = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(id)
  },

  create(data: CreateExpenseInput): number {
    const r = getDb().prepare(`
      INSERT INTO expenses (name, category_id, amount, date, due_date, is_paid, branch, notes, user_id, receipt_path, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      data.name, data.category_id ?? null, data.amount, data.date,
      data.due_date ?? null, data.is_paid ?? 0,
      data.branch ?? null, data.notes ?? null, data.user_id ?? null, data.receipt_path ?? null
    )
    return r.lastInsertRowid as number
  },

  update(id: number, data: Partial<CreateExpenseInput>): void {
    const db = getDb()
    const fields: string[] = []
    const params: (string | number | null)[] = []
    if (data.name         !== undefined) { fields.push('name = ?');         params.push(data.name) }
    if (data.category_id  !== undefined) { fields.push('category_id = ?');  params.push(data.category_id ?? null) }
    if (data.amount       !== undefined) { fields.push('amount = ?');       params.push(data.amount) }
    if (data.date         !== undefined) { fields.push('date = ?');         params.push(data.date) }
    if (data.due_date     !== undefined) { fields.push('due_date = ?');     params.push(data.due_date ?? null) }
    if (data.is_paid      !== undefined) { fields.push('is_paid = ?');      params.push(data.is_paid) }
    if (data.branch       !== undefined) { fields.push('branch = ?');       params.push(data.branch ?? null) }
    if (data.notes        !== undefined) { fields.push('notes = ?');        params.push(data.notes ?? null) }
    if (data.receipt_path !== undefined) { fields.push('receipt_path = ?'); params.push(data.receipt_path ?? null) }
    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")
    db.prepare(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`).run(...params, id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM expenses WHERE id = ?').run(id)
  },

  // ── Report queries ────────────────────────────────────────────────────────
  sumByCategory(from: string, to: string): { category_name: string; color: string; total: number }[] {
    return getDb().prepare(`
      SELECT COALESCE(ec.name, 'Uncategorized') as category_name,
             COALESCE(ec.color, '#6b7280') as color,
             SUM(e.amount) as total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.date BETWEEN ? AND ?
      GROUP BY e.category_id
      ORDER BY total DESC
    `).all(from, to) as { category_name: string; color: string; total: number }[]
  },

  sumByMonth(year: number): { month: string; total: number }[] {
    return getDb().prepare(`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
      FROM expenses
      WHERE strftime('%Y', date) = ?
      GROUP BY month ORDER BY month
    `).all(String(year)) as { month: string; total: number }[]
  },

  monthTotal(monthStart: string): number {
    const row = getDb().prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= ? AND date < date(?, '+1 month')`
    ).get(monthStart, monthStart) as { total: number }
    return row.total
  },
}
