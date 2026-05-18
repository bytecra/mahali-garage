import Database from 'better-sqlite3'

export function migration008(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  insert.run('app.name',    'Power Key')
  insert.run('app.tagline', 'Professional gaming store management system')
}
