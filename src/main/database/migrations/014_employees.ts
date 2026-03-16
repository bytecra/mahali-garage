import Database from 'better-sqlite3'

export function migration014(db: Database.Database): void {
  db.exec(`
    -- ── Employees ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employees (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id                 TEXT UNIQUE,
      full_name                   TEXT NOT NULL,
      nationality                 TEXT,
      national_id                 TEXT,
      date_of_birth               TEXT,
      phone                       TEXT,
      email                       TEXT,
      address                     TEXT,
      role                        TEXT NOT NULL,
      department                  TEXT,
      hire_date                   TEXT NOT NULL,
      employment_status           TEXT NOT NULL DEFAULT 'active'
                                    CHECK(employment_status IN ('active','on_leave','resigned','terminated')),
      salary                      REAL,
      salary_currency             TEXT DEFAULT 'USD',
      payment_frequency           TEXT DEFAULT 'monthly',
      emergency_contact_name      TEXT,
      emergency_contact_phone     TEXT,
      emergency_contact_relation  TEXT,
      is_on_vacation              INTEGER NOT NULL DEFAULT 0,
      current_vacation_start      TEXT,
      current_vacation_end        TEXT,
      notes                       TEXT,
      created_by                  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);

    -- ── Vacation / Leave History ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employee_vacations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      vacation_type     TEXT NOT NULL DEFAULT 'annual'
                          CHECK(vacation_type IN ('annual','sick','unpaid','emergency')),
      start_date        TEXT NOT NULL,
      end_date          TEXT NOT NULL,
      actual_return_date TEXT,
      status            TEXT NOT NULL DEFAULT 'approved'
                          CHECK(status IN ('pending','approved','rejected','completed')),
      reason            TEXT,
      approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emp_vacations_emp ON employee_vacations(employee_id);

    -- ── Employee Documents ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employee_documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      document_type     TEXT NOT NULL,
      document_name     TEXT NOT NULL,
      file_path         TEXT NOT NULL,
      file_size         INTEGER,
      mime_type         TEXT,
      issue_date        TEXT,
      expiry_date       TEXT,
      document_number   TEXT,
      notes             TEXT,
      uploaded_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emp_docs_emp ON employee_documents(employee_id);

    -- ── Counter ──────────────────────────────────────────────────────────────
    INSERT OR IGNORE INTO settings (key, value) VALUES ('employee.next_number', '1');
  `)
}
