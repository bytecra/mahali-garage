import Database from 'better-sqlite3'

export function migration027(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_cards_new (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number            TEXT UNIQUE NOT NULL,
      vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      owner_id              INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      job_type              TEXT NOT NULL DEFAULT 'General Service',
      priority              TEXT NOT NULL DEFAULT 'normal'
                              CHECK(priority IN ('low','normal','high','urgent')),
      status                TEXT NOT NULL DEFAULT 'pending'
                              CHECK(status IN (
                                'pending',
                                'in_progress',
                                'waiting_parts',
                                'waiting_for_programming',
                                'ready',
                                'completed_delivered',
                                'delivered',
                                'cancelled'
                              )),
      date_in               TEXT NOT NULL DEFAULT (datetime('now')),
      expected_completion   TEXT,
      date_out              TEXT,
      technician_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      bay_number            TEXT,
      mileage_in            INTEGER,
      mileage_out           INTEGER,
      complaint             TEXT,
      diagnosis             TEXT,
      work_done             TEXT,
      labor_hours           REAL DEFAULT 0,
      labor_rate            REAL DEFAULT 85,
      labor_total           REAL DEFAULT 0,
      parts_total           REAL DEFAULT 0,
      subtotal              REAL DEFAULT 0,
      tax_rate              REAL DEFAULT 0,
      tax_amount            REAL DEFAULT 0,
      total                 REAL DEFAULT 0,
      deposit               REAL DEFAULT 0,
      balance_due           REAL DEFAULT 0,
      notes                 TEXT,
      customer_authorized   INTEGER DEFAULT 0,
      created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      department            TEXT NOT NULL DEFAULT 'mechanical',
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO job_cards_new (
      id, job_number, vehicle_id, owner_id, job_type, priority, status, date_in, expected_completion, date_out,
      technician_id, bay_number, mileage_in, mileage_out, complaint, diagnosis, work_done, labor_hours, labor_rate,
      labor_total, parts_total, subtotal, tax_rate, tax_amount, total, deposit, balance_due, notes, customer_authorized,
      created_by, department, created_at, updated_at
    )
    SELECT
      id, job_number, vehicle_id, owner_id, job_type, priority,
      CASE
        WHEN status = 'waiting_programming' THEN 'waiting_for_programming'
        ELSE status
      END as status,
      date_in, expected_completion, date_out, technician_id, bay_number, mileage_in, mileage_out,
      complaint, diagnosis, work_done, labor_hours, labor_rate, labor_total, parts_total, subtotal,
      tax_rate, tax_amount, total, deposit, balance_due, notes, customer_authorized, created_by,
      COALESCE(department, 'mechanical') as department, created_at, updated_at
    FROM job_cards;

    DROP TABLE job_cards;
    ALTER TABLE job_cards_new RENAME TO job_cards;

    CREATE INDEX IF NOT EXISTS idx_job_cards_number     ON job_cards(job_number);
    CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle    ON job_cards(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_job_cards_owner      ON job_cards(owner_id);
    CREATE INDEX IF NOT EXISTS idx_job_cards_status     ON job_cards(status);
    CREATE INDEX IF NOT EXISTS idx_job_cards_technician ON job_cards(technician_id);
  `)
}
