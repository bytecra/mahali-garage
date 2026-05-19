import Database from 'better-sqlite3'

export function migration062(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','reserved','assembling','complete','sold','cancelled')),
      customer_id     INTEGER REFERENCES customers(id),
      sale_id         INTEGER REFERENCES sales(id),
      sell_price      REAL    NOT NULL DEFAULT 0,
      notes           TEXT,
      created_by      INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS build_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id        INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
      product_id      INTEGER NOT NULL REFERENCES products(id),
      product_name    TEXT    NOT NULL,
      quantity        REAL    NOT NULL CHECK(quantity > 0),
      unit_cost       REAL    NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_builds_status      ON builds(status);
    CREATE INDEX IF NOT EXISTS idx_build_items_build  ON build_items(build_id);
  `)
}
