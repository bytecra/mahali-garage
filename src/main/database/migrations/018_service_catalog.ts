import Database from 'better-sqlite3'

export function migration018(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS car_brands (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      logo       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_car_brands_name ON car_brands(name);

    CREATE TABLE IF NOT EXISTS service_catalog (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id        INTEGER NOT NULL REFERENCES car_brands(id) ON DELETE CASCADE,
      model           TEXT NOT NULL,
      service_name    TEXT NOT NULL,
      department      TEXT NOT NULL CHECK(department IN ('mechanical','programming')),
      price           REAL NOT NULL DEFAULT 0,
      estimated_time  INTEGER,
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_service_catalog_brand ON service_catalog(brand_id);
    CREATE INDEX IF NOT EXISTS idx_service_catalog_model ON service_catalog(model);
    CREATE INDEX IF NOT EXISTS idx_service_catalog_dept ON service_catalog(department);
  `)

  const seed = db.prepare(
    `INSERT OR IGNORE INTO car_brands (name, logo) VALUES (?, NULL)`
  )
  const brands = [
    'Toyota',
    'Nissan',
    'Hyundai',
    'Kia',
    'Ford',
    'BMW',
    'Mercedes',
    'Honda',
  ]
  for (const name of brands) {
    seed.run(name)
  }
}
