import Database from 'better-sqlite3'

/**
 * SQLite allows only one column per ALTER TABLE ... ADD COLUMN.
 * Duplicate column errors are ignored (idempotent re-runs / partial applies).
 */
function safeAddColumn(db: Database.Database, sql: string): void {
  try {
    db.exec(sql)
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('duplicate column name')) throw e
  }
}

export function migration038(
  db: Database.Database
): void {
  // Employee formatted ID (distinct from existing employees.employee_id in 014)
  safeAddColumn(
    db,
    `ALTER TABLE employees ADD COLUMN employee_id_number TEXT UNIQUE`
  )

  // Department: already on employees since 014 — nothing to add.

  // Job performance on custom receipts
  safeAddColumn(
    db,
    `ALTER TABLE custom_receipts ADD COLUMN primary_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`
  )
  safeAddColumn(
    db,
    `ALTER TABLE custom_receipts ADD COLUMN assistant_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`
  )
  safeAddColumn(
    db,
    `ALTER TABLE custom_receipts ADD COLUMN hours_worked REAL DEFAULT 0`
  )
  safeAddColumn(
    db,
    `ALTER TABLE custom_receipts ADD COLUMN work_start_time TEXT`
  )
  safeAddColumn(
    db,
    `ALTER TABLE custom_receipts ADD COLUMN work_end_time TEXT`
  )

  // salary_payments (028): id, employee_id, amount, period_start, period_end,
  // paid_date, status, notes, expense_id, created_at — none of the following exist; no conflicts.
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN overtime_hours REAL DEFAULT 0`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN overtime_rate REAL DEFAULT 1.25`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN overtime_amount REAL DEFAULT 0`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN bonus_amount REAL DEFAULT 0`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN bonus_type TEXT`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN bonus_note TEXT`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN absence_deduction REAL DEFAULT 0`
  )
  safeAddColumn(
    db,
    `ALTER TABLE salary_payments ADD COLUMN absence_days INTEGER DEFAULT 0`
  )

  db.exec(`
    INSERT OR IGNORE INTO settings 
      (key, value)
    VALUES
      ('employee.id_format', '{"prefix":"","separator":"-","useYear":true,"padding":4,"startFrom":1}');

    INSERT OR IGNORE INTO settings
      (key, value)
    VALUES
      ('employee.id_card', '{"showPhoto":true,"showName":true,"showId":true,"showDepartment":true,"showPhone":false,"bgColor":"#1e40af","textColor":"#ffffff"}');

    CREATE INDEX IF NOT EXISTS
      idx_employees_id_number
      ON employees(employee_id_number);

    CREATE INDEX IF NOT EXISTS
      idx_receipts_primary_emp
      ON custom_receipts(primary_employee_id);
  `)
}
