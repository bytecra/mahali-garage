import Database from 'better-sqlite3'

/**
 * Jobs report to one department only (mechanical | programming).
 * Legacy "both" → mechanical. Technicians get optional work_department on users.
 */
export function migration050(db: Database.Database): void {
  db.exec(`
    UPDATE job_cards SET department = 'mechanical' WHERE department = 'both';
  `)

  const tables = new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(r => r.name),
  )
  if (tables.has('appointments')) {
    db.exec(`UPDATE appointments SET department = 'mechanical' WHERE department = 'both'`)
  }

  const userCols = new Set(
    (db.pragma('table_info(users)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!userCols.has('work_department')) {
    db.exec(`ALTER TABLE users ADD COLUMN work_department TEXT`)
  }
}
