import Database from 'better-sqlite3'

export function migration009(db: Database.Database): void {
  db.exec(`
    -- ── Vehicles ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS vehicles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id          INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      make              TEXT NOT NULL,
      model             TEXT NOT NULL,
      year              INTEGER,
      vin               TEXT UNIQUE,
      license_plate     TEXT,
      color             TEXT,
      mileage           INTEGER DEFAULT 0,
      engine_type       TEXT,
      transmission      TEXT,
      insurance_company TEXT,
      insurance_policy  TEXT,
      insurance_expiry  TEXT,
      notes             TEXT,
      photo_url         TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_owner   ON vehicles(owner_id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_plate   ON vehicles(license_plate);
    CREATE INDEX IF NOT EXISTS idx_vehicles_vin     ON vehicles(vin);

    -- ── Job Cards (extends repairs concept) ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS job_cards (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number      TEXT UNIQUE NOT NULL,
      vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      owner_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      date_in         TEXT NOT NULL DEFAULT (datetime('now')),
      date_out        TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','waiting_parts','ready','delivered','cancelled')),
      technician_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      bay_number      TEXT,
      mileage_in      INTEGER,
      mileage_out     INTEGER,
      complaint       TEXT,
      diagnosis       TEXT,
      work_done       TEXT,
      labor_hours     REAL DEFAULT 0,
      labor_rate      REAL DEFAULT 0,
      parts_total     REAL DEFAULT 0,
      labor_total     REAL DEFAULT 0,
      total           REAL DEFAULT 0,
      notes           TEXT,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_cards_number     ON job_cards(job_number);
    CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle    ON job_cards(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_job_cards_owner      ON job_cards(owner_id);
    CREATE INDEX IF NOT EXISTS idx_job_cards_status     ON job_cards(status);
    CREATE INDEX IF NOT EXISTS idx_job_cards_technician ON job_cards(technician_id);

    -- ── Job Parts (parts used in a job card) ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS job_parts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_card_id   INTEGER NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
      product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
      description   TEXT,
      quantity      INTEGER NOT NULL DEFAULT 1,
      unit_price    REAL NOT NULL DEFAULT 0,
      total         REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_job_parts_job ON job_parts(job_card_id);

    -- ── Services Catalog ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS services_catalog (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      description     TEXT,
      category        TEXT,
      estimated_time  INTEGER,
      price           REAL DEFAULT 0,
      parts_included  TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Counters for job cards ────────────────────────────────────────────────
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.next_number', '1');
  `)
}
