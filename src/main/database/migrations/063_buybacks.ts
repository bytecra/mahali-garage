import Database from 'better-sqlite3'

export function migration063(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS buybacks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER REFERENCES customers(id),
      device_type     TEXT    NOT NULL,
      brand           TEXT,
      model           TEXT,
      serial_number   TEXT,
      condition_grade TEXT    NOT NULL DEFAULT 'C'
                        CHECK(condition_grade IN ('A','B','C','D','broken')),
      buyback_price   REAL    NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'received'
                        CHECK(status IN ('received','inspecting','refurbishing','ready','sold','scrapped')),
      job_card_id     INTEGER REFERENCES job_cards(id),
      product_id      INTEGER REFERENCES products(id),
      resale_price    REAL,
      sold_at         TEXT,
      notes           TEXT,
      received_by     INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_buybacks_status      ON buybacks(status);
    CREATE INDEX IF NOT EXISTS idx_buybacks_customer    ON buybacks(customer_id);
  `)
}
