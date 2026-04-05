import Database from 'better-sqlite3'

/** Optional JSON inspection diagram + notes on custom receipts. */
export function migration043(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(custom_receipts)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'inspection_data')) {
    db.exec(`
      ALTER TABLE custom_receipts
        ADD COLUMN inspection_data TEXT;
    `)
  }
}
