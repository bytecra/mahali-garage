import { getDb } from '../index'

/** Stored in `users.preferences_json` — personal UI choices, not store invoice settings. */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system'
  language?: 'en' | 'ar'
  jobCardsView?: 'kanban' | 'list'
}

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
  preferences_json?: string | null
}

export interface UserListRow extends Omit<UserRow, 'password_hash' | 'passcode'> {
  override_count: number
  /** mechanical | programming | both (multi-skilled) | null (any) */
  work_department?: string | null
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

function parsePreferences(raw: string | null | undefined): UserPreferences {
  if (raw == null || raw === '') return {}
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: UserPreferences = {}
    if (o.theme === 'light' || o.theme === 'dark' || o.theme === 'system') out.theme = o.theme
    if (o.language === 'en' || o.language === 'ar') out.language = o.language
    if (o.jobCardsView === 'kanban' || o.jobCardsView === 'list') out.jobCardsView = o.jobCardsView
    return out
  } catch {
    return {}
  }
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
             u.work_department,
             (SELECT COUNT(*) FROM user_permissions WHERE user_id = u.id) AS override_count
      FROM users u
      ORDER BY u.full_name
    `).all() as UserListRow[]
  },

  create(data: {
    username: string
    password_hash: string
    full_name: string
    role: string
    work_department?: string | null
  }): number {
    const wd = data.work_department ?? null
    const result = getDb().prepare(`
      INSERT INTO users (username, password_hash, auth_type, passcode, full_name, role, work_department)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.username, data.password_hash, 'password', null, data.full_name, data.role, wd)
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<{
    username: string; password_hash: string; full_name: string
    role: string; is_active: number
    auth_type: 'password' | 'passcode_4' | 'passcode_6'
    passcode: string | null
    work_department: string | null
    preferences_json: string
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

  getPreferences(userId: number): UserPreferences {
    const row = getDb().prepare('SELECT preferences_json FROM users WHERE id = ?').get(userId) as
      | { preferences_json: string | null }
      | undefined
    return parsePreferences(row?.preferences_json)
  },

  updatePreferences(userId: number, patch: Partial<UserPreferences>): void {
    const cur = this.getPreferences(userId)
    const next: UserPreferences = { ...cur, ...patch }
    const json = JSON.stringify(next)
    getDb()
      .prepare(`UPDATE users SET preferences_json = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(json, userId)
  },
}
