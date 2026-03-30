import Database from 'better-sqlite3'

export function migration019(db: Database.Database): void {
  const names = (db.pragma('table_info(expenses)') as { name: string }[]).map(c => c.name)
  if (!names.includes('department')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN department TEXT`)
  }
}
