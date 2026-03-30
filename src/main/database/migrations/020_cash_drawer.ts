import Database from 'better-sqlite3'

export function migration020(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_drawer_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      amount REAL NOT NULL CHECK (amount > 0),
      entry_type TEXT NOT NULL CHECK (entry_type IN (
        'opening_balance','sale_payment','manual_in','withdrawal','change_given','manual_out'
      )),
      note TEXT,
      payment_id INTEGER UNIQUE REFERENCES payments(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cash_drawer_business_date ON cash_drawer_transactions(business_date);
    CREATE INDEX IF NOT EXISTS idx_cash_drawer_created_at ON cash_drawer_transactions(created_at);
  `)

  try {
    db.exec(`
      INSERT OR IGNORE INTO cash_drawer_transactions (business_date, created_at, direction, amount, entry_type, note, payment_id)
      SELECT date(p.created_at), p.created_at, 'in', p.amount, 'sale_payment',
             'Imported from existing sale', p.id
      FROM payments p
      INNER JOIN sales s ON s.id = p.sale_id AND s.status != 'voided'
      WHERE p.method = 'cash' AND p.amount > 0
    `)
  } catch {
    /* safe if payments/sales missing */
  }
}
