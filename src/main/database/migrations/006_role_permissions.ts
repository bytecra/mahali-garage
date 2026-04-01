import Database from 'better-sqlite3'

// ── Runs OUTSIDE the migration transaction (needed to disable FK checks for DDL) ──
export function preUp006(db: Database.Database): void {
  // Idempotency guard — skip if 'manager' role already in schema
  const meta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    .get() as { sql: string } | undefined
  if (meta?.sql?.includes("'manager'")) return

  db.pragma('foreign_keys = OFF')

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_tmp006 (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        full_name     TEXT    NOT NULL,
        role          TEXT    NOT NULL
                          CHECK(role IN ('owner','manager','cashier','technician','accountant')),
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec(`INSERT INTO users_tmp006 SELECT * FROM users`)
    db.exec(`DROP TABLE users`)
    db.exec(`ALTER TABLE users_tmp006 RENAME TO users`)
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

// Role defaults snapshot (must match authService.ts ROLE_DEFAULTS exactly)
const ROLE_DEFAULTS_SNAP: Record<string, string[]> = {
  owner: [
    'sales.view','sales.create','sales.void','sales.discount',
    'inventory.view','inventory.edit','inventory.delete','inventory.adjust_stock',
    'customers.view','customers.edit','customers.delete',
    'repairs.view','repairs.edit','repairs.updateStatus','repairs.delete',
    'reports.view','reports.export',
    'expenses.view','expenses.add','expenses.delete','expenses.manage_categories',
    'users.manage','settings.manage','backup.manage','activity_log.view',
  ],
  cashier:     ['sales.view','sales.create','sales.discount','inventory.view','customers.view','customers.edit'],
  technician:  ['repairs.view','repairs.updateStatus','inventory.view','customers.view'],
  accountant:  ['sales.view','reports.view','reports.export','customers.view','expenses.view','expenses.add'],
}

// ── Runs inside migration transaction ──────────────────────────────────────────
export function migration006(db: Database.Database): void {
  // 1. Add new granular permissions
  const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)')
  insertPerm.run('invoices.edit',         'Edit and modify invoice details')
  insertPerm.run('products.update_price', 'Update product sell/cost prices')
  insertPerm.run('reports.financial',     'Access financial profit & expense reports')
  insertPerm.run('reports.employee',      'Access employee activity reports')

  // 2. Clean up user_permissions — remove rows that are already covered by role defaults.
  //    After this, user_permissions contains ONLY true overrides (deviations from role).
  const users = db.prepare('SELECT id, role FROM users').all() as { id: number; role: string }[]
  const deleteStmt = db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission_id = ?')

  for (const user of users) {
    const defaults = new Set(ROLE_DEFAULTS_SNAP[user.role] ?? [])
    if (defaults.size === 0) continue

    const userPerms = db.prepare(`
      SELECT up.permission_id, p.key
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = ? AND up.granted = 1
    `).all(user.id) as { permission_id: number; key: string }[]

    for (const perm of userPerms) {
      if (defaults.has(perm.key)) deleteStmt.run(user.id, perm.permission_id)
    }
  }
}
