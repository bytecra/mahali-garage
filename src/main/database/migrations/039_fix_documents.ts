import Database from 'better-sqlite3'

export function migration039(db: Database.Database): void {
  // Add has_expiry to employee_documents (014 schema; some DBs ran 037 before this ALTER existed)
  const cols = db.prepare('PRAGMA table_info(employee_documents)').all() as Array<{ name: string }>

  const hasExpiry = cols.some(c => c.name === 'has_expiry')

  if (!hasExpiry) {
    db.exec(`
      ALTER TABLE employee_documents
        ADD COLUMN has_expiry INTEGER
        NOT NULL DEFAULT 1;
    `)
  }

  // store_documents is new — safe to create (simpler doc_type than 037; no CHECK in user spec)
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      doc_type    TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      has_expiry  INTEGER NOT NULL DEFAULT 1,
      expiry_date TEXT,
      notes       TEXT,
      uploaded_by INTEGER
                  REFERENCES users(id)
                  ON DELETE SET NULL,
      created_at  TEXT NOT NULL
                  DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS
      password_reset_requests (
      id           INTEGER PRIMARY KEY
                   AUTOINCREMENT,
      user_id      INTEGER NOT NULL
                   REFERENCES users(id)
                   ON DELETE CASCADE,
      status       TEXT NOT NULL
                   DEFAULT 'pending'
                   CHECK(status IN (
                     'pending',
                     'accepted',
                     'rejected'
                   )),
      requested_at TEXT NOT NULL
                   DEFAULT (datetime('now')),
      resolved_by  INTEGER
                   REFERENCES users(id)
                   ON DELETE SET NULL,
      resolved_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS
      idx_store_docs_expiry
      ON store_documents(expiry_date)
      WHERE has_expiry = 1;

    CREATE INDEX IF NOT EXISTS
      idx_reset_requests_status
      ON password_reset_requests(status);
  `)

  // must_change_password — 037 may have failed or been skipped on some DBs
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>

  const hasMustChange = userCols.some(c => c.name === 'must_change_password')

  if (!hasMustChange) {
    db.exec(`
      ALTER TABLE users 
        ADD COLUMN must_change_password
        INTEGER NOT NULL DEFAULT 0;
    `)
  }
}
