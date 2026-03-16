import Database from 'better-sqlite3'

export function migration005(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      category_id  INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
      amount       REAL NOT NULL DEFAULT 0,
      date         TEXT NOT NULL,
      branch       TEXT,
      notes        TEXT,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      receipt_path TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_user     ON expenses(user_id);
  `)

  // Seed default categories
  const insertCat = db.prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)')
  const categories: [string, string][] = [
    ['Rent',        '#ef4444'],
    ['Utilities',   '#f97316'],
    ['Internet',    '#3b82f6'],
    ['Salaries',    '#8b5cf6'],
    ['Maintenance', '#f59e0b'],
    ['Supplies',    '#10b981'],
    ['Transport',   '#6366f1'],
    ['Marketing',   '#ec4899'],
    ['Other',       '#6b7280'],
  ]
  for (const [name, color] of categories) insertCat.run(name, color)

  // Add expense permissions
  const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)')
  insertPerm.run('expenses.view',              'View operating expenses')
  insertPerm.run('expenses.add',               'Add/edit operating expenses')
  insertPerm.run('expenses.delete',            'Delete operating expenses')
  insertPerm.run('expenses.manage_categories', 'Manage expense categories')
}
