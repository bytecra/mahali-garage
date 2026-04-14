import Database from 'better-sqlite3'

/**
 * Unified service catalog (no brand/model) + job line / invoice snapshot columns.
 */
export function migration047(db: Database.Database): void {
  const hasLegacy = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='service_catalog'`)
    .get() as { name: string } | undefined

  if (hasLegacy) {
    const cols = new Set(
      (db.pragma('table_info(service_catalog)') as Array<{ name: string }>).map(c => c.name),
    )
    if (cols.has('brand_id')) {
      db.exec(`ALTER TABLE service_catalog RENAME TO service_catalog_legacy`)

      db.exec(`
        CREATE TABLE service_catalog (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name    TEXT NOT NULL,
          description     TEXT,
          default_price   REAL NOT NULL DEFAULT 0,
          department      TEXT NOT NULL,
          category        TEXT,
          estimated_time  INTEGER,
          active            INTEGER NOT NULL DEFAULT 1,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_service_catalog_dept ON service_catalog(department);
        CREATE INDEX IF NOT EXISTS idx_service_catalog_cat ON service_catalog(category);
        CREATE INDEX IF NOT EXISTS idx_service_catalog_active ON service_catalog(active);
        CREATE INDEX IF NOT EXISTS idx_service_catalog_name ON service_catalog(service_name);
      `)

      try {
        db.exec(`
          INSERT INTO service_catalog (service_name, description, default_price, department, category, estimated_time, active, created_at)
          SELECT
            TRIM(service_name),
            NULL,
            MAX(price),
            department,
            NULL,
            MAX(estimated_time),
            MAX(active),
            MIN(created_at)
          FROM service_catalog_legacy
          GROUP BY LOWER(TRIM(service_name)), department
        `)
      } catch {
        /* if duplicate issues, best-effort row-by-row */
        const rows = db.prepare(`SELECT * FROM service_catalog_legacy`).all() as Array<{
          service_name: string
          department: string
          price: number
          estimated_time: number | null
          active: number
          created_at: string
        }>
        const seen = new Set<string>()
        const ins = db.prepare(`
          INSERT OR IGNORE INTO service_catalog (service_name, description, default_price, department, category, estimated_time, active, created_at)
          VALUES (?, NULL, ?, ?, NULL, ?, ?, ?)
        `)
        for (const r of rows) {
          const k = `${r.service_name.trim().toLowerCase()}\0${r.department}`
          if (seen.has(k)) continue
          seen.add(k)
          ins.run(
            r.service_name.trim(),
            r.price,
            r.department,
            r.estimated_time,
            r.active,
            r.created_at,
          )
        }
      }

      db.exec(`DROP TABLE service_catalog_legacy`)
    }
  }

  const jp = new Set(
    (db.pragma('table_info(job_parts)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!jp.has('service_catalog_id')) {
    db.exec(`ALTER TABLE job_parts ADD COLUMN service_catalog_id INTEGER REFERENCES service_catalog(id) ON DELETE SET NULL`)
  }
  if (!jp.has('default_unit_price')) {
    db.exec(`ALTER TABLE job_parts ADD COLUMN default_unit_price REAL`)
  }

  const jii = new Set(
    (db.pragma('table_info(job_invoice_items)') as Array<{ name: string }>).map(c => c.name),
  )
  if (jii.size > 0) {
    if (!jii.has('service_catalog_id')) {
      db.exec(`ALTER TABLE job_invoice_items ADD COLUMN service_catalog_id INTEGER REFERENCES service_catalog(id) ON DELETE SET NULL`)
    }
    if (!jii.has('default_unit_price')) {
      db.exec(`ALTER TABLE job_invoice_items ADD COLUMN default_unit_price REAL`)
    }
    if (!jii.has('custom_unit_price')) {
      db.exec(`ALTER TABLE job_invoice_items ADD COLUMN custom_unit_price REAL`)
    }
  }
}
