import Database from 'better-sqlite3'

export function migration028(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_salaries (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id    INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
      salary_type    TEXT NOT NULL CHECK(salary_type IN ('monthly','weekly','daily','one_time','custom')),
      amount         REAL NOT NULL DEFAULT 0,
      payment_day    INTEGER,
      start_date     TEXT NOT NULL,
      notes          TEXT,
      custom_period  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_employee_salaries_emp ON employee_salaries(employee_id);

    CREATE TABLE IF NOT EXISTS salary_payments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount          REAL NOT NULL,
      period_start    TEXT NOT NULL,
      period_end      TEXT NOT NULL,
      paid_date       TEXT,
      status          TEXT NOT NULL CHECK(status IN ('paid','unpaid','overdue')),
      notes           TEXT,
      expense_id      INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_payments_period
      ON salary_payments(employee_id, period_start);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_emp ON salary_payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_salary_payments_status ON salary_payments(status);
  `)

  const ins = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
  ins.run('payroll.reminders_enabled', '1')
  ins.run('payroll.reminder_days_before', '2')
}
