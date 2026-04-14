import Database from 'better-sqlite3'

/** Quick-create jobs use profile_complete = 0 until fully filled in the editor. */
export function migration049(db: Database.Database): void {
  const cols = new Set(
    (db.pragma('table_info(job_cards)') as Array<{ name: string }>).map(c => c.name),
  )
  if (!cols.has('profile_complete')) {
    db.exec(`ALTER TABLE job_cards ADD COLUMN profile_complete INTEGER NOT NULL DEFAULT 1`)
  }
}
