import Database from 'better-sqlite3'

export function migration032(db: Database.Database): void {
  // Seed additional gaming hardware brands (logos can be uploaded via Settings)
  const upsert = db.prepare(
    `INSERT OR IGNORE INTO car_brands (name, logo) VALUES (?, NULL)`
  )
  const gamingBrands = [
    'ASUS', 'MSI', 'Logitech', 'Corsair', 'Razer',
    'HyperX', 'Gigabyte', 'NZXT', 'Cooler Master', 'Thermaltake',
    'Seagate', 'Western Digital', 'Samsung', 'Kingston', 'Crucial',
    'EVGA', 'Sapphire', 'XFX', 'Zotac', 'PNY',
    'Sony', 'Microsoft', 'Nintendo', 'Valve', 'Alienware',
    'SteelSeries', 'BenQ', 'LG', 'AOC', 'ViewSonic',
    'Intel', 'AMD', 'NVIDIA', 'be quiet!', 'Noctua',
  ]
  for (const name of gamingBrands) {
    upsert.run(name)
  }
}
