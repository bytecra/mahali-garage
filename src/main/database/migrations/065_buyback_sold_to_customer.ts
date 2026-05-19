import type Database from 'better-sqlite3'

export function migration065(db: Database.Database): void {
  db.exec(`ALTER TABLE buybacks ADD COLUMN sold_to_customer_id INTEGER REFERENCES customers(id);`)
}
