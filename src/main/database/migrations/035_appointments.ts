import Database from 'better-sqlite3'

export function migration035(
  db: Database.Database
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id                INTEGER PRIMARY KEY 
                        AUTOINCREMENT,
      customer_id       INTEGER 
                        REFERENCES customers(id)
                        ON DELETE SET NULL,
      customer_name     TEXT NOT NULL,
      customer_phone    TEXT,
      vehicle_id        INTEGER
                        REFERENCES vehicles(id)
                        ON DELETE SET NULL,
      car_company       TEXT,
      car_model         TEXT,
      car_year          TEXT,
      plate_number      TEXT,
      department        TEXT NOT NULL 
                        DEFAULT 'mechanical'
                        CHECK(department IN (
                          'mechanical',
                          'programming',
                          'both'
                        )),
      service_notes     TEXT,
      technician_id     INTEGER
                        REFERENCES employees(id)
                        ON DELETE SET NULL,
      appointment_date  TEXT NOT NULL,
      appointment_time  TEXT NOT NULL,
      duration_minutes  INTEGER NOT NULL 
                        DEFAULT 60,
      status            TEXT NOT NULL 
                        DEFAULT 'scheduled'
                        CHECK(status IN (
                          'scheduled',
                          'arrived',
                          'in_progress',
                          'completed',
                          'cancelled'
                        )),
      job_card_id       INTEGER
                        REFERENCES job_cards(id)
                        ON DELETE SET NULL,
      created_by        INTEGER
                        REFERENCES users(id)
                        ON DELETE SET NULL,
      created_at        TEXT NOT NULL
                        DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL
                        DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS
      idx_appointments_date
      ON appointments(appointment_date);

    CREATE INDEX IF NOT EXISTS
      idx_appointments_customer
      ON appointments(customer_id);

    CREATE INDEX IF NOT EXISTS
      idx_appointments_status
      ON appointments(status);

    CREATE INDEX IF NOT EXISTS
      idx_appointments_dept
      ON appointments(department);
  `)
}
