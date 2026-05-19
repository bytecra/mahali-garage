import Database from 'better-sqlite3'

export function migration061(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_reservations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_card_id     INTEGER NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
      product_id      INTEGER NOT NULL REFERENCES products(id),
      quantity        REAL    NOT NULL CHECK(quantity > 0),
      status          TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'consumed', 'released')),
      reserved_by     INTEGER REFERENCES users(id),
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stock_reservations_job   ON stock_reservations(job_card_id);
    CREATE INDEX IF NOT EXISTS idx_stock_reservations_prod  ON stock_reservations(product_id, status);
  `)
}
