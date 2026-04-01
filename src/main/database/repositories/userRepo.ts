import { getDb } from '../index'

export interface UserRow {
  id: number
  username: string
  password_hash: string
  auth_type: 'password' | 'passcode_4' | 'passcode_6'
  passcode: string | null
  full_name: string
  role: 'owner' | 'manager' | 'cashier' | 'technician' | 'accountant'
  is_active: number
  created_at: string
  updated_at: string
}

export interface UserListRow extends Omit<UserRow, 'password_hash' | 'passcode'> {
  override_count: number
}

export interface PermissionRow {
  id: number
  key: string
  description: string | null
}

export interface OverrideRow {
  key: string
  granted: boolean
  description: string | null
}

export const userRepo = {
  findByUsername(username: string): UserRow | undefined {
    return getDb()
      .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
      .get(username) as UserRow | undefined
  },

  findById(id: number): UserRow | undefined {
    return getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined
  },

  list(): UserListRow[] {
    return getDb().prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.auth_type, u.is_active, u.created_at, u.updated_at,
             (SELECT COUNT(*) FROM user_permissions WHERE user_id = u.id) AS override_count
      FROM users u
      ORDER BY u.full_name
    `).all() as UserListRow[]
  },

  create(data: { username: string; password_hash: string; full_name: string; role: string }): number {
    const result = getDb().prepare(`
      INSERT INTO users (username, password_hash, auth_type, passcode, full_name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.username, data.password_hash, 'password', null, data.full_name, data.role)
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<{
    username: string; password_hash: string; full_name: string
    role: string; is_active: number
    auth_type: 'password' | 'passcode_4' | 'passcode_6'
    passcode: string | null
  }>): void {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return
    const fields = entries.map(([k]) => `${k} = ?`).join(', ')
    const values = entries.map(([, v]) => v)
    getDb().prepare(
      `UPDATE users SET ${fields}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values, id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id)
  },

  // Returns ONLY user-specific overrides (deviations from role defaults)
  // granted=true → extra permission beyond role; granted=false → revocation of role default
  getUserOverrides(userId: number): OverrideRow[] {
    return getDb().prepare(`
      SELECT p.key, CAST(up.granted AS INTEGER) as granted, p.description
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = ?
    `).all(userId) as OverrideRow[]
  },

  // Upsert a single permission override for a user
  setOverride(userId: number, permKey: string, granted: boolean): void {
    const db = getDb()
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(permKey) as { id: number } | undefined
    if (!perm) return
    db.prepare(`
      INSERT INTO user_permissions (user_id, permission_id, granted)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, permission_id) DO UPDATE SET granted = excluded.granted
    `).run(userId, perm.id, granted ? 1 : 0)
  },

  // Remove a permission override — user reverts to role default
  removeOverride(userId: number, permKey: string): void {
    const db = getDb()
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(permKey) as { id: number } | undefined
    if (!perm) return
    db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission_id = ?').run(userId, perm.id)
  },

  // Legacy: replace ALL overrides at once (used by old flow)
  setPermissions(userId: number, permissionKeys: string[]): void {
    const db = getDb()
    const run = db.transaction(() => {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId)
      if (permissionKeys.length === 0) return
      const getPerm = db.prepare('SELECT id FROM permissions WHERE key = ?')
      const insert  = db.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission_id, granted) VALUES (?, ?, 1)')
      for (const key of permissionKeys) {
        const perm = getPerm.get(key) as { id: number } | undefined
        if (perm) insert.run(userId, perm.id)
      }
    })
    run()
  },

  getAllPermissions(): PermissionRow[] {
    return getDb()
      .prepare('SELECT * FROM permissions ORDER BY key')
      .all() as PermissionRow[]
  },

  countOwners(): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'owner' AND is_active = 1")
      .get() as { cnt: number }
    return row.cnt
  },
}
