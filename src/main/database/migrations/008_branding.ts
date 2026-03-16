import Database from 'better-sqlite3'

export function migration008(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  insert.run('app.name',    'Mahali POS')
  insert.run('app.tagline', 'Welcome to Mahali POS')
}
