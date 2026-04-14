import Database from 'better-sqlite3'

/** Car diagram (JSON) + billing preferences for job invoices on job_cards. */
export function migration051(db: Database.Database): void {
  const cols = (db.pragma('table_info(job_cards)') as Array<{ name: string }>).map(c => c.name)
  if (!cols.includes('inspection_data')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN inspection_data TEXT`)
  }
  if (!cols.includes('payment_method')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN payment_method TEXT`)
  }
  if (!cols.includes('invoice_discount_type')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN invoice_discount_type TEXT`)
  }
  if (!cols.includes('invoice_discount_value')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN invoice_discount_value REAL DEFAULT 0`)
  }
  if (!cols.includes('invoice_payment_terms')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN invoice_payment_terms TEXT`)
  }
}
