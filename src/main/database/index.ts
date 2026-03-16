import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from '../utils/logger'
import { runMigrations } from './migrations/runner'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'mahali.db')
  log.info(`Database path: ${dbPath}`)

  db = new Database(dbPath)

  // Performance and reliability settings
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8000') // 8MB cache
  db.pragma('temp_store = MEMORY')

  await runMigrations(db)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
