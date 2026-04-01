import Database from 'better-sqlite3'

export function migration031(db: Database.Database): void {
  db.exec(`
    ALTER TABLE custom_receipts 
      ADD COLUMN discount_type TEXT;
    ALTER TABLE custom_receipts 
      ADD COLUMN discount_value REAL NOT NULL DEFAULT 0;
    ALTER TABLE custom_receipts 
      ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
  `)
}
