import Database from 'better-sqlite3'

/**
 * Warranty templates (owner-defined) and per–job-in warranty rows (invoice-wide, per line, or service-linked).
 */
export function migration057(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS warranty_templates (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT NOT NULL,
      scope               TEXT NOT NULL DEFAULT 'invoice' CHECK (scope IN ('invoice','line','service')),
      duration_months     INTEGER,
      service_catalog_id  INTEGER REFERENCES service_catalog(id) ON DELETE SET NULL,
      notes               TEXT,
      sort_order          INTEGER NOT NULL DEFAULT 0,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_warranty_templates_scope ON warranty_templates(scope);
    CREATE INDEX IF NOT EXISTS idx_warranty_templates_catalog ON warranty_templates(service_catalog_id);

    CREATE TABLE IF NOT EXISTS job_invoice_warranties (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      job_invoice_id        INTEGER NOT NULL REFERENCES job_invoices(id) ON DELETE CASCADE,
      scope                 TEXT NOT NULL CHECK (scope IN ('invoice','line','service')),
      job_part_id           INTEGER REFERENCES job_parts(id) ON DELETE SET NULL,
      job_invoice_item_id   INTEGER REFERENCES job_invoice_items(id) ON DELETE SET NULL,
      warranty_template_id  INTEGER REFERENCES warranty_templates(id) ON DELETE SET NULL,
      service_catalog_id    INTEGER REFERENCES service_catalog(id) ON DELETE SET NULL,
      title                 TEXT NOT NULL,
      duration_months       INTEGER,
      effective_date        TEXT NOT NULL,
      expiry_date           TEXT,
      notes                 TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_invoice_warranties_invoice ON job_invoice_warranties(job_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_job_invoice_warranties_part ON job_invoice_warranties(job_part_id);
  `)
}
