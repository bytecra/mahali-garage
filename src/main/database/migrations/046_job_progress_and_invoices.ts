import Database from 'better-sqlite3'

/**
 * Job line cost tracking, progress comments, and job-linked invoices (Mahali schema uses INTEGER FKs).
 */
export function migration046(db: Database.Database): void {
  const partsCols = new Set(
    (db.pragma('table_info(job_parts)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!partsCols.has('cost_price')) {
    db.exec(`ALTER TABLE job_parts ADD COLUMN cost_price REAL`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_progress_comments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_card_id   INTEGER NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      comment       TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_progress_comments_job ON job_progress_comments(job_card_id);

    CREATE TABLE IF NOT EXISTS job_invoices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_card_id     INTEGER NOT NULL UNIQUE REFERENCES job_cards(id) ON DELETE CASCADE,
      owner_id        INTEGER NOT NULL REFERENCES customers(id),
      vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id),
      invoice_number  TEXT NOT NULL UNIQUE,
      total_amount    REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'draft',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_invoices_number ON job_invoices(invoice_number);

    CREATE TABLE IF NOT EXISTS job_invoice_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      job_invoice_id   INTEGER NOT NULL REFERENCES job_invoices(id) ON DELETE CASCADE,
      description      TEXT NOT NULL,
      quantity         INTEGER NOT NULL DEFAULT 1,
      unit_price       REAL NOT NULL,
      total_price      REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_invoice_items_parent ON job_invoice_items(job_invoice_id);
  `)
}
