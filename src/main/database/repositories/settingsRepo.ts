import { getDb } from '../index'

interface SettingRow {
  key: string
  value: string | null
  updated_at?: string
}

export const settingsRepo = {
  getAll(): Record<string, string> {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as SettingRow[]
    return Object.fromEntries(rows.map(r => [r.key, r.value ?? '']))
  },

  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined
    return row?.value ?? null
  },

  getWithMeta(key: string): { value: string | null; updated_at: string | null } {
    const row = getDb()
      .prepare('SELECT value, updated_at FROM settings WHERE key = ?')
      .get(key) as SettingRow | undefined
    return { value: row?.value ?? null, updated_at: row?.updated_at ?? null }
  },

  set(key: string, value: string): void {
    getDb().prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value)
  },

  setBulk(entries: Record<string, string>): void {
    const stmt = getDb().prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const run = getDb().transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        stmt.run(key, value)
      }
    })
    run()
  },

  getNextInvoiceNumber(): number {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'invoice.next_number'").get() as SettingRow | undefined
    return parseInt(row?.value ?? '1', 10)
  },

  incrementInvoiceNumber(): number {
    const db = getDb()
    const current = this.getNextInvoiceNumber()
    const next = current + 1
    db.prepare(`
      UPDATE settings SET value = ?, updated_at = datetime('now')
      WHERE key = 'invoice.next_number'
    `).run(String(next))
    return current
  },

  getStoreStartDate(): string | null {
    const raw = this.get('store.start_date')
    if (!raw) return null
    const v = raw.trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  },

  getEarliestBusinessDate(): string | null {
    const row = getDb()
      .prepare(`
        SELECT MIN(d) as min_date
        FROM (
          SELECT date(created_at) as d FROM sales
          UNION ALL
          SELECT date(created_at) as d FROM custom_receipts
          UNION ALL
          SELECT date(date) as d FROM expenses
        )
      `)
      .get() as { min_date: string | null }
    return row?.min_date ?? null
  },

  getLatestBusinessDate(): string | null {
    const row = getDb()
      .prepare(`
        SELECT MAX(d) as max_date
        FROM (
          SELECT date(created_at) as d FROM sales
          UNION ALL
          SELECT date(created_at) as d FROM custom_receipts
          UNION ALL
          SELECT date(date) as d FROM expenses
        )
      `)
      .get() as { max_date: string | null }
    return row?.max_date ?? null
  },

  getEffectiveStoreStartDate(): string | null {
    return this.getStoreStartDate() ?? this.getEarliestBusinessDate()
  },
}
