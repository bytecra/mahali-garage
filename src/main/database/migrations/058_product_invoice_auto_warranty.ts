import Database from 'better-sqlite3'

/**
 * Optional default warranty text on inventory products; job invoice rows can auto-attach per line
 * with auto_from_product_id. Dismissals let users remove an auto warranty without it reappearing until
 * the line leaves the invoice or is re-synced after cleanup.
 */
export function migration058(db: Database.Database): void {
  const prodCols = (db.pragma('table_info(products)') as Array<{ name: string }>).map(c => c.name)
  if (!prodCols.includes('warranty_title')) {
    db.exec(`ALTER TABLE products ADD COLUMN warranty_title TEXT`)
  }
  if (!prodCols.includes('warranty_duration_months')) {
    db.exec(`ALTER TABLE products ADD COLUMN warranty_duration_months INTEGER`)
  }
  if (!prodCols.includes('warranty_notes')) {
    db.exec(`ALTER TABLE products ADD COLUMN warranty_notes TEXT`)
  }

  const wCols = (db.pragma('table_info(job_invoice_warranties)') as Array<{ name: string }>).map(c => c.name)
  if (!wCols.includes('auto_from_product_id')) {
    db.exec(`
      ALTER TABLE job_invoice_warranties ADD COLUMN auto_from_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_job_invoice_warranties_auto_product ON job_invoice_warranties(auto_from_product_id)`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_invoice_auto_warranty_dismissals (
      job_invoice_id INTEGER NOT NULL REFERENCES job_invoices(id) ON DELETE CASCADE,
      job_part_id    INTEGER NOT NULL REFERENCES job_parts(id) ON DELETE CASCADE,
      product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (job_invoice_id, job_part_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_job_inv_auto_warr_dismiss_invoice ON job_invoice_auto_warranty_dismissals(job_invoice_id);
  `)
}
