import Database from 'better-sqlite3'

/** Garage logo (base64), invoice format / reset keys for Phase 2. */
export function migration017(db: Database.Database): void {
  const entries: Array<[string, string]> = [
    ['store_logo', ''],
    ['invoice_number_format', 'prefix_number'],
    ['invoice_prefix', ''],
    ['invoice_starting_number', '1'],
    ['invoice_reset', 'never'],
    ['invoice.period_key', ''],
  ]
  const stmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
  for (const [k, v] of entries) {
    stmt.run(k, v)
  }
}
