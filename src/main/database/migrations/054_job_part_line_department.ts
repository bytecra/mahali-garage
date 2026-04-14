import Database from 'better-sqlite3'

export function migration054(db: Database.Database): void {
  const cols = (db.pragma('table_info(job_parts)') as Array<{ name: string }>).map(c => c.name)
  if (!cols.includes('line_department')) {
    db.exec(`
      ALTER TABLE job_parts ADD COLUMN line_department TEXT NOT NULL DEFAULT 'mechanical';
    `)
  }
}
