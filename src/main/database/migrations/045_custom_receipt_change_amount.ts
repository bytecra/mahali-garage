import Database from 'better-sqlite3'

export function migration045(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(custom_receipts)').all() as Array<{ name: string }>
  const hasChangeAmount = cols.some((c) => c.name === 'change_amount')
  if (!hasChangeAmount) {
    db.exec(`ALTER TABLE custom_receipts ADD COLUMN change_amount REAL`)
  }
}

