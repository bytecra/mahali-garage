import Database from 'better-sqlite3'

/**
 * Patch migration: ensures job_cards has all garage-specific columns.
 * Covers the case where migration 009 was applied before these columns
 * were added to the schema.
 */
export function migration011(db: Database.Database): void {
  const existing = new Set(
    (db.pragma('table_info(job_cards)') as Array<{ name: string }>).map(c => c.name)
  )

  function addCol(col: string, def: string): void {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE job_cards ADD COLUMN ${col} ${def}`)
    }
  }

  addCol('job_type', "TEXT NOT NULL DEFAULT 'General Service'")
  addCol('priority', "TEXT NOT NULL DEFAULT 'normal'")
  addCol('bay_number', 'TEXT')
  addCol('mileage_in', 'INTEGER')
  addCol('mileage_out', 'INTEGER')
  addCol('expected_completion', 'TEXT')
  addCol('labor_hours', 'REAL DEFAULT 0')
  addCol('labor_rate', 'REAL DEFAULT 85')
  addCol('labor_total', 'REAL DEFAULT 0')
  addCol('parts_total', 'REAL DEFAULT 0')
  addCol('subtotal', 'REAL DEFAULT 0')
  addCol('tax_rate', 'REAL DEFAULT 0')
  addCol('tax_amount', 'REAL DEFAULT 0')
  addCol('deposit', 'REAL DEFAULT 0')
  addCol('balance_due', 'REAL DEFAULT 0')
  addCol('customer_authorized', 'INTEGER DEFAULT 0')

  // Ensure the vehicles table also has all expected columns
  const vCols = new Set(
    (db.pragma('table_info(vehicles)') as Array<{ name: string }>).map(c => c.name)
  )
  function addVCol(col: string, def: string): void {
    if (!vCols.has(col)) {
      db.exec(`ALTER TABLE vehicles ADD COLUMN ${col} ${def}`)
    }
  }

  addVCol('engine_type', 'TEXT')
  addVCol('transmission', 'TEXT')
  addVCol('insurance_company', 'TEXT')
  addVCol('insurance_policy', 'TEXT')
  addVCol('insurance_expiry', 'TEXT')
  addVCol('photo_url', 'TEXT')

  // Ensure job_parts.created_at exists (used by top-parts dashboard query)
  const jpCols = new Set(
    (db.pragma('table_info(job_parts)') as Array<{ name: string }>).map(c => c.name)
  )
  if (!jpCols.has('created_at')) {
    db.exec(`ALTER TABLE job_parts ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`)
  }
}
