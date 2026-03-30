import type Database from 'better-sqlite3'
import { getDb } from '../index'

export type CashDrawerEntryType =
  | 'opening_balance'
  | 'sale_payment'
  | 'manual_in'
  | 'withdrawal'
  | 'change_given'
  | 'manual_out'

export interface CashDrawerRow {
  id: number
  business_date: string
  created_at: string
  direction: 'in' | 'out'
  amount: number
  entry_type: CashDrawerEntryType
  note: string | null
  payment_id: number | null
}

/** Call inside sale transaction after inserting a payment row. */
export function insertSalePaymentInTx(db: Database.Database, paymentId: number, saleId: number): void {
  const row = db.prepare(
    `SELECT created_at, method, amount FROM payments WHERE id = ?`,
  ).get(paymentId) as { created_at: string; method: string; amount: number } | undefined
  if (!row || row.method !== 'cash' || row.amount <= 0) return
  const bd = row.created_at.slice(0, 10)
  const inv = db.prepare(`SELECT invoice_number FROM invoices WHERE sale_id = ?`).get(saleId) as
    | { invoice_number: string }
    | undefined
  const note = inv ? `Invoice ${inv.invoice_number}` : `Sale #${saleId}`
  db.prepare(`
    INSERT OR IGNORE INTO cash_drawer_transactions (business_date, created_at, direction, amount, entry_type, note, payment_id)
    VALUES (?, ?, 'in', ?, 'sale_payment', ?, ?)
  `).run(bd, row.created_at, row.amount, note, paymentId)
}

/** Remove auto-linked rows when voiding a sale (inside same transaction). */
export function removeLedgerForSaleInTx(db: Database.Database, saleId: number): void {
  db.prepare(`
    DELETE FROM cash_drawer_transactions
    WHERE payment_id IN (SELECT id FROM payments WHERE sale_id = ?)
  `).run(saleId)
}

function whereDateRange(from?: string | null, to?: string | null): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const parts: string[] = []
  if (from) {
    parts.push('business_date >= ?')
    params.push(from)
  }
  if (to) {
    parts.push('business_date <= ?')
    params.push(to)
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

export const cashDrawerRepo = {
  setOpeningBalance(businessDate: string, amount: number): void {
    const db = getDb()
    db.transaction(() => {
      db.prepare(`
        DELETE FROM cash_drawer_transactions
        WHERE business_date = ? AND entry_type = 'opening_balance'
      `).run(businessDate)
      if (amount > 0) {
        db.prepare(`
          INSERT INTO cash_drawer_transactions (business_date, direction, amount, entry_type, note, payment_id)
          VALUES (?, 'in', ?, 'opening_balance', 'Opening balance', NULL)
        `).run(businessDate, amount)
      }
    })()
  },

  addManual(input: {
    direction: 'in' | 'out'
    amount: number
    entry_type: CashDrawerEntryType
    note?: string | null
    business_date?: string
  }): number {
    const db = getDb()
    const bd = input.business_date ?? new Date().toISOString().slice(0, 10)
    if (input.amount <= 0) throw new Error('Amount must be positive')
    const r = db.prepare(`
      INSERT INTO cash_drawer_transactions (business_date, direction, amount, entry_type, note, payment_id)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(bd, input.direction, input.amount, input.entry_type, input.note?.trim() || null)
    return r.lastInsertRowid as number
  },

  list(filters: { from?: string | null; to?: string | null; limit?: number } = {}): CashDrawerRow[] {
    const db = getDb()
    const { sql, params } = whereDateRange(filters.from, filters.to)
    const lim = Math.min(filters.limit ?? 200, 500)
    return db.prepare(`
      SELECT * FROM cash_drawer_transactions
      ${sql}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `).all(...params, lim) as CashDrawerRow[]
  },

  summary(filters: { from?: string | null; to?: string | null } = {}): {
    total_in: number
    total_out: number
    drawer_balance: number
    opening_total: number
    cash_sales_total: number
    other_in_total: number
  } {
    const db = getDb()
    const { sql, params } = whereDateRange(filters.from, filters.to)

    const agg = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_drawer_transactions
      ${sql}
    `).get(...params) as { total_in: number; total_out: number }

    let openingSql = sql ? `${sql} AND entry_type = 'opening_balance' AND direction = 'in'` : `WHERE entry_type = 'opening_balance' AND direction = 'in'`
    const opening_total = (
      db.prepare(`SELECT COALESCE(SUM(amount), 0) AS o FROM cash_drawer_transactions ${openingSql}`).get(...params) as { o: number }
    ).o

    let salesSql = sql
      ? `${sql} AND entry_type = 'sale_payment' AND direction = 'in'`
      : `WHERE entry_type = 'sale_payment' AND direction = 'in'`
    const cash_sales_total = (
      db.prepare(`SELECT COALESCE(SUM(amount), 0) AS o FROM cash_drawer_transactions ${salesSql}`).get(...params) as { o: number }
    ).o

    const other_in_total = agg.total_in - opening_total - cash_sales_total
    return {
      total_in: agg.total_in,
      total_out: agg.total_out,
      drawer_balance: agg.total_in - agg.total_out,
      opening_total,
      cash_sales_total,
      other_in_total,
    }
  },
}
