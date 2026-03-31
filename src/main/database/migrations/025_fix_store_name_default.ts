import Database from 'better-sqlite3'

export function migration025(db: Database.Database): void {
  // Update store.name only if it still holds the old seed default
  db.prepare(`
    UPDATE settings SET value = 'Mahali Garage'
    WHERE key = 'store.name' AND value = 'My Gaming Store'
  `).run()
}
