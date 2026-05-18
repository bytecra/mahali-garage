import Database from 'better-sqlite3'

export function migration016(db: Database.Database): void {
  db.exec(`
    ALTER TABLE job_cards ADD COLUMN department TEXT NOT NULL DEFAULT 'tech';
    ALTER TABLE invoices ADD COLUMN department TEXT NOT NULL DEFAULT 'tech';
  `)
}
