import Database from 'better-sqlite3'

/** Personal UI preferences per user (theme, language, job board layout — not invoice/store settings). */
export function migration056(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'preferences_json')) {
    db.exec(`ALTER TABLE users ADD COLUMN preferences_json TEXT DEFAULT '{}'`)
  }
}
