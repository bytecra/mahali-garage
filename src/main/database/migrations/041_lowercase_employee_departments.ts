import Database from 'better-sqlite3'

/** Normalize legacy Title Case / mixed-case department values for attendance / repairs alignment. */
export function migration041(db: Database.Database): void {
  db.exec(`
    UPDATE employees
    SET department = LOWER(department)
    WHERE department IS NOT NULL
      AND TRIM(department) != ''
      AND department != LOWER(department)
  `)
}
