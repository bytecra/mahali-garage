import Database from 'better-sqlite3'

export function migration012(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_receipts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number      TEXT UNIQUE NOT NULL,
      customer_name       TEXT NOT NULL DEFAULT 'Walk-in Customer',
      plate_number        TEXT,
      car_type            TEXT,
      services_description TEXT,
      amount              REAL NOT NULL,
      payment_method      TEXT NOT NULL DEFAULT 'Cash',
      notes               TEXT,
      created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custom_receipts_number ON custom_receipts(receipt_number);
    CREATE INDEX IF NOT EXISTS idx_custom_receipts_plate  ON custom_receipts(plate_number);

    INSERT OR IGNORE INTO settings (key, value) VALUES ('custom_receipt.next_number', '1');
  `)
}
