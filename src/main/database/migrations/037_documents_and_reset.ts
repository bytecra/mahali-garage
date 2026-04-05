import Database from 'better-sqlite3'

/** 014_employees already defines `employee_documents` without `has_expiry`; partial index below needs this column. */
function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some(r => r.name === column)
}

export function migration037(
  db: Database.Database
): void {
  if (!columnExists(db, 'employee_documents', 'has_expiry')) {
    db.exec(`
      ALTER TABLE employee_documents ADD COLUMN has_expiry INTEGER NOT NULL DEFAULT 1;
    `)
  }

  db.exec(`
    /*
     * REMOVED: CREATE TABLE employee_documents (...)
     * That DDL was a no-op on every real database because 014_employees
     * already created employee_documents. The intended new shape (name,
     * doc_type, created_at, …) never applied. Schema fixes belong in a
     * dedicated migration; has_expiry is ensured above and again in 039
     * for databases that ran an older 037 before that ALTER existed.
     */

    CREATE TABLE IF NOT EXISTS 
      store_documents (
      id            INTEGER PRIMARY KEY 
                    AUTOINCREMENT,
      name          TEXT NOT NULL,
      doc_type      TEXT NOT NULL
                    CHECK(doc_type IN (
                      'trade_license',
                      'municipality_cert',
                      'insurance',
                      'lease',
                      'bank_account',
                      'tax_certificate',
                      'other'
                    )),
      file_path     TEXT NOT NULL,
      file_name     TEXT NOT NULL,
      has_expiry    INTEGER NOT NULL DEFAULT 1,
      expiry_date   TEXT,
      notes         TEXT,
      uploaded_by   INTEGER
                    REFERENCES users(id)
                    ON DELETE SET NULL,
      created_at    TEXT NOT NULL
                    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS
      password_reset_requests (
      id            INTEGER PRIMARY KEY
                    AUTOINCREMENT,
      user_id       INTEGER NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,
      status        TEXT NOT NULL
                    DEFAULT 'pending'
                    CHECK(status IN (
                      'pending',
                      'accepted',
                      'rejected'
                    )),
      requested_at  TEXT NOT NULL
                    DEFAULT (datetime('now')),
      resolved_by   INTEGER
                    REFERENCES users(id)
                    ON DELETE SET NULL,
      resolved_at   TEXT
    );
  `)

  try {
    db.exec(`
      ALTER TABLE users ADD COLUMN
        must_change_password INTEGER
        NOT NULL DEFAULT 0;
    `)
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_emp_docs_employee
      ON employee_documents(employee_id);

    CREATE INDEX IF NOT EXISTS
      idx_emp_docs_expiry
      ON employee_documents(expiry_date)
      WHERE has_expiry = 1;

    CREATE INDEX IF NOT EXISTS
      idx_store_docs_expiry
      ON store_documents(expiry_date)
      WHERE has_expiry = 1;

    CREATE INDEX IF NOT EXISTS
      idx_reset_requests_user
      ON password_reset_requests(user_id);

    CREATE INDEX IF NOT EXISTS
      idx_reset_requests_status
      ON password_reset_requests(status);
  `)
}
