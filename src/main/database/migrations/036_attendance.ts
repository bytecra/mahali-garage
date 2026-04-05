import Database from 'better-sqlite3'

export function migration036(
  db: Database.Database
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS 
      attendance_status_types (
      id               INTEGER PRIMARY KEY 
                       AUTOINCREMENT,
      name             TEXT NOT NULL UNIQUE,
      color            TEXT NOT NULL 
                       DEFAULT '#6b7280',
      emoji            TEXT,
      is_default       INTEGER NOT NULL 
                       DEFAULT 0,
      is_paid          INTEGER NOT NULL 
                       DEFAULT 1,
      counts_as_working INTEGER NOT NULL 
                       DEFAULT 0,
      sort_order       INTEGER NOT NULL 
                       DEFAULT 0,
      created_by       INTEGER 
                       REFERENCES users(id)
                       ON DELETE SET NULL,
      created_at       TEXT NOT NULL
                       DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO attendance_status_types
      (name, color, emoji, is_default, 
       is_paid, counts_as_working, sort_order)
    VALUES
      ('Present',      '#22c55e', '✅', 
       1, 1, 1, 1),
      ('Absent',       '#ef4444', '🔴', 
       1, 0, 0, 2),
      ('Sick Leave',   '#f97316', '🤒', 
       1, 1, 0, 3),
      ('Annual Leave', '#3b82f6', '🏖️', 
       1, 1, 0, 4);

    CREATE TABLE IF NOT EXISTS 
      employee_attendance (
      id              INTEGER PRIMARY KEY 
                      AUTOINCREMENT,
      employee_id     INTEGER NOT NULL
                      REFERENCES employees(id)
                      ON DELETE CASCADE,
      date            TEXT NOT NULL,
      status_type_id  INTEGER NOT NULL
                      REFERENCES 
                      attendance_status_types(id),
      department      TEXT NOT NULL 
                      DEFAULT 'all'
                      CHECK(department IN (
                        'all',
                        'mechanical',
                        'programming'
                      )),
      notes           TEXT,
      marked_by       INTEGER
                      REFERENCES users(id)
                      ON DELETE SET NULL,
      marked_at       TEXT NOT NULL
                      DEFAULT (datetime('now')),
      UNIQUE(employee_id, date)
    );

    CREATE INDEX IF NOT EXISTS
      idx_attendance_employee_date
      ON employee_attendance(employee_id, date);

    CREATE INDEX IF NOT EXISTS
      idx_attendance_date
      ON employee_attendance(date);

    CREATE INDEX IF NOT EXISTS
      idx_attendance_status
      ON employee_attendance(status_type_id);
  `)
}
