import Database from 'better-sqlite3'

export function migration033(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_loyalty (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id  INTEGER NOT NULL 
                   REFERENCES customers(id) 
                   ON DELETE CASCADE,
      department   TEXT NOT NULL DEFAULT 'all'
                   CHECK(department IN (
                     'all','mechanical','programming'
                   )),
      points       INTEGER NOT NULL DEFAULT 0,
      stamps       INTEGER NOT NULL DEFAULT 0,
      total_visits INTEGER NOT NULL DEFAULT 0,
      tier_level   INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL 
                   DEFAULT (datetime('now')),
      UNIQUE(customer_id, department)
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id  INTEGER NOT NULL 
                   REFERENCES customers(id) 
                   ON DELETE CASCADE,
      department   TEXT NOT NULL DEFAULT 'all'
                   CHECK(department IN (
                     'all','mechanical','programming'
                   )),
      type         TEXT NOT NULL
                   CHECK(type IN (
                     'earn_points','earn_stamps',
                     'redeem','manual_adjust'
                   )),
      points_delta INTEGER NOT NULL DEFAULT 0,
      stamps_delta INTEGER NOT NULL DEFAULT 0,
      visits_delta INTEGER NOT NULL DEFAULT 0,
      source       TEXT CHECK(source IN (
                     'invoice','receipt','manual'
                   )),
      source_id    INTEGER,
      note         TEXT,
      created_by   INTEGER 
                   REFERENCES users(id) 
                   ON DELETE SET NULL,
      created_at   TEXT NOT NULL 
                   DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS
      idx_loyalty_customer_dept
      ON customer_loyalty(customer_id, department);

    CREATE INDEX IF NOT EXISTS
      idx_loyalty_tx_customer
      ON loyalty_transactions(customer_id);

    CREATE INDEX IF NOT EXISTS
      idx_loyalty_tx_dept
      ON loyalty_transactions(customer_id, department);

    CREATE INDEX IF NOT EXISTS
      idx_loyalty_tx_created
      ON loyalty_transactions(created_at);
  `)
}
