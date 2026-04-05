import Database from 'better-sqlite3'

export function migration040(db: Database.Database): void {
  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)'
  )
  insertPerm.run(
    'employees.attendance',
    'Mark and bulk-mark employee attendance'
  )
}
