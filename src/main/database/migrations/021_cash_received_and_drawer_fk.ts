import Database from 'better-sqlite3'

export function migration021(db: Database.Database): void {
  try {
    db.exec(`ALTER TABLE payments ADD COLUMN cash_received REAL`)
  } catch {
    /* column may already exist */
  }

  try {
    db.exec(`ALTER TABLE custom_receipts ADD COLUMN cash_received REAL`)
  } catch {
    /* column may already exist */
  }

  const hasOld = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='cash_drawer_transactions'
  `).get() as { name: string } | undefined
  if (!hasOld) return

  db.exec(`
    CREATE TABLE cash_drawer_transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      amount REAL NOT NULL CHECK (amount > 0),
      entry_type TEXT NOT NULL CHECK (entry_type IN (
        'opening_balance','sale_payment','manual_in','withdrawal','change_given','manual_out'
      )),
      note TEXT,
      payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL
    );
    INSERT INTO cash_drawer_transactions_new
      SELECT id, business_date, created_at, direction, amount, entry_type, note, payment_id
      FROM cash_drawer_transactions;
    DROP TABLE cash_drawer_transactions;
    ALTER TABLE cash_drawer_transactions_new RENAME TO cash_drawer_transactions;
    CREATE INDEX IF NOT EXISTS idx_cash_drawer_business_date ON cash_drawer_transactions(business_date);
    CREATE INDEX IF NOT EXISTS idx_cash_drawer_created_at ON cash_drawer_transactions(created_at);
  `)
}
