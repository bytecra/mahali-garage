import Database from 'better-sqlite3'

export function migration060(db: Database.Database): void {
  try {
    db.exec(`ALTER TABLE vehicles ADD COLUMN specs_json TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }
}
