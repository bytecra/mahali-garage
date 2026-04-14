import Database from 'better-sqlite3'

export function migration053(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_card_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      uploaded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
      FOREIGN KEY(uploaded_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_job_attachments_job ON job_attachments(job_card_id, created_at DESC);
  `)
}
