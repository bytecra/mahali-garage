import type Database from 'better-sqlite3'

export function migration063(db: Database.Database): void {
  db.exec(`
    ALTER TABLE buybacks ADD COLUMN storage      TEXT;
    ALTER TABLE buybacks ADD COLUMN ram          TEXT;
    ALTER TABLE buybacks ADD COLUMN color        TEXT;
    ALTER TABLE buybacks ADD COLUMN imei         TEXT;
    ALTER TABLE buybacks ADD COLUMN battery_health INTEGER;
    ALTER TABLE buybacks ADD COLUMN accessories  TEXT;
  `)
}
