import Database from 'better-sqlite3'

export function migration015(db: Database.Database): void {
  db.exec(`
    ALTER TABLE expenses ADD COLUMN due_date TEXT;
    ALTER TABLE expenses ADD COLUMN is_paid  INTEGER NOT NULL DEFAULT 0;
  `)
}
