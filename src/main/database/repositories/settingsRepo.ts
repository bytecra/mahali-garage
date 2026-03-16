import { getDb } from '../index'

interface SettingRow {
  key: string
  value: string | null
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
}
