import Database from 'better-sqlite3'

export function migration024(db: Database.Database): void {
  db.exec(`
    ALTER TABLE custom_receipts ADD COLUMN smart_recipe INTEGER NOT NULL DEFAULT 0;
  `)
}
