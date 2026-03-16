import Database from 'better-sqlite3'

export function migration010(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO job_types (name, description, sort_order) VALUES
      ('General Service',   'Routine maintenance and service',        1),
      ('Oil Change',        'Oil and filter change service',          2),
      ('Brake Service',     'Brake inspection and repair',            3),
      ('Engine Repair',     'Engine diagnostics and repairs',         4),
      ('Transmission Work', 'Transmission service and repair',        5),
      ('Electrical Repair', 'Electrical system diagnostics',          6),
      ('Body Work',         'Body and paint work',                    7),
      ('Tire Service',      'Tire replacement and balancing',         8),
      ('Diagnostic',        'General diagnostic services',            9),
      ('AC/Heating',        'Climate control service',               10),
      ('Suspension',        'Suspension and steering repair',        11),
      ('Exhaust System',    'Exhaust system repair',                 12),
      ('Custom Work',       'Custom modifications',                  13),
      ('Other',             'Other services',                        14);
  `)
}
