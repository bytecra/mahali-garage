import Database from 'better-sqlite3'

export function migration013(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_settings (
      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      enabled             INTEGER NOT NULL DEFAULT 1,
      frequency           TEXT NOT NULL DEFAULT 'daily',
      time                TEXT NOT NULL DEFAULT '02:00',
      day_of_week         INTEGER NOT NULL DEFAULT 0,
      backup_location     TEXT,
      retention_count     INTEGER NOT NULL DEFAULT 5,
      last_backup_at      TEXT,
      last_backup_status  TEXT,
      last_backup_size    INTEGER,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO backup_settings (id) VALUES (1);
  `)
}
