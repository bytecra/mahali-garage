import Database from 'better-sqlite3'

/** Subtotal, tax, discount, notes on job-linked invoices; job_part_id on lines. */
export function migration048(db: Database.Database): void {
  const invCols = new Set(
    (db.pragma('table_info(job_invoices)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!invCols.has('subtotal')) db.exec(`ALTER TABLE job_invoices ADD COLUMN subtotal REAL`)
  if (!invCols.has('tax_rate')) db.exec(`ALTER TABLE job_invoices ADD COLUMN tax_rate REAL`)
  if (!invCols.has('tax_amount')) db.exec(`ALTER TABLE job_invoices ADD COLUMN tax_amount REAL`)
  if (!invCols.has('discount_type')) db.exec(`ALTER TABLE job_invoices ADD COLUMN discount_type TEXT`)
  if (!invCols.has('discount_value')) db.exec(`ALTER TABLE job_invoices ADD COLUMN discount_value REAL DEFAULT 0`)
  if (!invCols.has('notes')) db.exec(`ALTER TABLE job_invoices ADD COLUMN notes TEXT`)
  if (!invCols.has('payment_terms')) db.exec(`ALTER TABLE job_invoices ADD COLUMN payment_terms TEXT`)

  const itemCols = new Set(
    (db.pragma('table_info(job_invoice_items)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!itemCols.has('job_part_id')) {
    db.exec(`
      ALTER TABLE job_invoice_items ADD COLUMN job_part_id INTEGER REFERENCES job_parts(id) ON DELETE SET NULL
    `)
  }
}
