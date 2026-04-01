import Database from 'better-sqlite3'

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some((r) => r.name === column)
}

export function migration026(db: Database.Database): void {
  if (!hasColumn(db, 'job_cards', 'department')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN department TEXT NOT NULL DEFAULT 'mechanical'`)
  }

  if (!hasColumn(db, 'invoices', 'department')) {
    db.exec(`ALTER TABLE invoices ADD COLUMN department TEXT NOT NULL DEFAULT 'mechanical'`)
  }
}
