import bcrypt from 'bcryptjs'
import { userRepo } from '../database/repositories/userRepo'

// Role-based default permissions — single source of truth
// When adding/changing these, also update 006_role_permissions.ts ROLE_DEFAULTS_SNAP
export const ROLE_DEFAULTS: Record<string, string[]> = {
  owner: [
    'sales.view', 'sales.create', 'sales.void', 'sales.discount',
    'inventory.view', 'inventory.edit', 'inventory.delete', 'inventory.adjust_stock',
    'customers.view', 'customers.edit', 'customers.delete',
    'repairs.view', 'repairs.edit', 'repairs.updateStatus', 'repairs.delete',
    'reports.view', 'reports.export', 'reports.financial', 'reports.employee',
    'expenses.view', 'expenses.add', 'expenses.delete', 'expenses.manage_categories',
    'invoices.edit', 'products.update_price',
    'users.manage', 'settings.manage', 'backup.manage', 'activity_log.view',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete', 'tasks.assign',
    'deliveries.view',
  ],
  manager: [
    'sales.view', 'sales.create', 'sales.void', 'sales.discount',
    'inventory.view', 'inventory.edit', 'inventory.adjust_stock', 'products.update_price',
    'customers.view', 'customers.edit',
    'repairs.view', 'repairs.edit', 'repairs.updateStatus',
    'reports.view', 'reports.export', 'reports.financial',
    'expenses.view', 'expenses.add', 'expenses.manage_categories',
    'invoices.edit',
    'users.manage',
    'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign',
    'deliveries.view',
  ],
  cashier: [
    'sales.view', 'sales.create', 'sales.discount',
    'inventory.view',
    'customers.view', 'customers.edit',
    'tasks.view',
  ],
  technician: [
    'repairs.view', 'repairs.updateStatus',
    'inventory.view',
    'customers.view',
    'tasks.view',
  ],
  accountant: [
    'sales.view',
    'reports.view', 'reports.export',
    'customers.view',
    'expenses.view', 'expenses.add',
    'tasks.view',
  ],
}

export interface Session {
  userId: number
  username: string
  fullName: string
  role: string
  permissions: string[]
}

// In-memory session store (keyed by webContents ID)
const sessions = new Map<number, Session>()

export const authService = {
  async login(username: string, password: string): Promise<Session | null> {
    const user = userRepo.findByUsername(username)
    if (!user) return null

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return null

    // Start with role defaults, then apply user overrides (grants + revocations)
    const permSet = new Set(ROLE_DEFAULTS[user.role] ?? [])
    const overrides = userRepo.getUserOverrides(user.id)
    for (const ov of overrides) {
      if (ov.granted) permSet.add(ov.key)
      else permSet.delete(ov.key)
    }

    return {
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      permissions: Array.from(permSet),
    }
  },

  storeSession(senderId: number, session: Session): void {
    sessions.set(senderId, session)
  },

  getSession(senderId: number): Session | undefined {
    return sessions.get(senderId)
  },

  clearSession(senderId: number): void {
    sessions.delete(senderId)
  },

  hasPermission(senderId: number, permission: string): boolean {
    const session = sessions.get(senderId)
    const roleAllowed = session?.permissions.includes(permission) ?? false
    if (!roleAllowed) return false

    // Map permissions that are tier-restricted to license features
    // BASIC-only features are implicitly allowed for all active licenses
    const permissionToFeature: Record<string, string> = {
      // Reports (STANDARD+)
      'reports.view': 'reports.view',
      'reports.export': 'reports.export',
      'reports.financial': 'reports.view',
      'reports.employee': 'reports.view',

      // Expenses (STANDARD+)
      'expenses.view': 'expenses.view',
      'expenses.add': 'expenses.add',
      'expenses.delete': 'expenses.add',
      'expenses.manage_categories': 'expenses.add',

      // Tasks & calendar (STANDARD+)
      'tasks.view': 'tasks.view',
      'tasks.create': 'tasks.add',
      'tasks.edit': 'tasks.add',
      'tasks.delete': 'tasks.add',
      'tasks.assign': 'tasks.add',
      'deliveries.view': 'tasks.view',

      // Invoices (STANDARD+)
      'invoices.edit': 'invoices.edit',

      // Repairs (PREMIUM)
      'repairs.view': 'repairs.view',
      'repairs.edit': 'repairs.edit',
      'repairs.updateStatus': 'repairs.edit',
      'repairs.delete': 'repairs.edit',

      // Activity log & backup (PREMIUM)
      'activity_log.view': 'activity_log.view',
      'backup.manage': 'backup.manage',
    }

    const feature = permissionToFeature[permission]
    if (!feature) return roleAllowed

    try {
      // Lazy require to avoid circular imports at module top level
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const licenseManager = require('../licensing/license-manager') as typeof import('../licensing/license-manager')
      return roleAllowed && licenseManager.hasFeature(feature)
    } catch {
      return false
    }
  },

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = userRepo.findById(userId)
    if (!user) return false

    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return false

    const hash = await bcrypt.hash(newPassword, 12)
    userRepo.update(userId, { password_hash: hash })
    return true
  },
}
