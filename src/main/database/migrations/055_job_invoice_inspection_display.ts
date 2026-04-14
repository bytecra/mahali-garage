import type Database from 'better-sqlite3'

/** Per-job preference before invoice exists; per-invoice flag after invoice is created. */
export function migration055(db: Database.Database): void {
  const invCols = (db.pragma('table_info(job_invoices)') as Array<{ name: string }>).map(c => c.name)
  if (!invCols.includes('include_inspection_on_invoice')) {
    db.exec(
      `ALTER TABLE job_invoices ADD COLUMN include_inspection_on_invoice INTEGER NOT NULL DEFAULT 0`,
    )
  }

  const jobCols = (db.pragma('table_info(job_cards)') as Array<{ name: string }>).map(c => c.name)
  if (!jobCols.includes('invoice_include_inspection')) {
    db.exec(
      `ALTER TABLE job_cards ADD COLUMN invoice_include_inspection INTEGER NOT NULL DEFAULT 0`,
    )
  }
}
