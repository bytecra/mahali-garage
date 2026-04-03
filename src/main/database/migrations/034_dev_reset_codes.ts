import Database from 'better-sqlite3'

export function migration034(
  db: Database.Database
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_reset_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      username    TEXT NOT NULL,
      device_id   TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL 
                  DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS 
      idx_reset_codes_code 
      ON dev_reset_codes(code);
  `)
}
