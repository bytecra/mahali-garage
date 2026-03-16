import Database from 'better-sqlite3'

/**
 * Migration 003 — add missing counter/config settings for existing DBs.
 * Uses INSERT OR IGNORE so it's safe to run multiple times.
 */
export function migration003(db: Database.Database): void {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  const newSettings: [string, string][] = [
    ['sale.next_number',   '1'],
    ['repair.next_number', '1'],
  ]
  for (const [key, value] of newSettings) {
    insert.run(key, value)
  }
}
