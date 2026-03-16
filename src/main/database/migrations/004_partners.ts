import Database from 'better-sqlite3'

export function migration004(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      type         TEXT    NOT NULL DEFAULT 'other'
                     CHECK(type IN ('distributor','reseller','manufacturer','consultant','other')),
      contact_name TEXT,
      phone        TEXT,
      email        TEXT,
      address      TEXT,
      website      TEXT,
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_partners_name ON partners(name);
    CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(type);
  `)
}
