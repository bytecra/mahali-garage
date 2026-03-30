import Database from 'better-sqlite3'

export function migration022(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      purchase_price REAL NOT NULL,
      current_value REAL,
      description TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_purchase_date ON assets(purchase_date);
  `)

  const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)')
  insertPerm.run('assets.view', 'View fixed assets register')
  insertPerm.run('assets.add', 'Add and edit fixed assets')
  insertPerm.run('assets.delete', 'Delete fixed assets')
}
