import { ipcMain } from 'electron'
import { userRepo } from '../database/repositories/userRepo'
import { authService, ROLE_DEFAULTS } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'
import bcrypt from 'bcryptjs'

export function registerUserHandlers(): void {
  ipcMain.handle('users:list', (event, filters?: { role?: string }) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      const users = userRepo.list()
      const result = filters?.role ? users.filter(u => u.role === filters.role) : users
      return ok({ rows: result, total: result.length })
    } catch (e) { log.error('users:list', e); return err('Failed', 'ERR_USERS') }
  })

  ipcMain.handle('users:create', (event, input: { username: string; password: string; full_name: string; role: string }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      // Enforce license user limit
      try {
        // Lazy require to avoid circular deps
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const licenseManager = require('../licensing/license-manager') as typeof import('../licensing/license-manager')
        const info = licenseManager.getTieredLicenseInfo()
        if (info.maxUsers !== -1) {
          const currentCount = userRepo.list().length
          if (currentCount >= info.maxUsers) {
            return err('Your license plan does not allow adding more users.', 'ERR_LICENSE_USER_LIMIT')
          }
        }
      } catch (e) {
        log.error('users:create license check failed', e)
        return err('License check failed', 'ERR_LICENSE')
      }
      const hash = bcrypt.hashSync(input.password, 12)
      const id = userRepo.create({ ...input, password_hash: hash })
      const session = authService.getSession(event.sender.id)
      try { activityLogRepo.log({ userId: session?.userId ?? null, action: 'user.create', entity: 'user', entityId: id, details: JSON.stringify({ username: input.username, role: input.role }) }) } catch {}
      return ok(id)
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Username already exists' : 'Failed to create user'
      return err(msg, 'ERR_USERS')
    }
  })

  ipcMain.handle('users:update', (event, id: number, input: { full_name?: string; role?: string; is_active?: boolean }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      userRepo.update(id, { full_name: input.full_name, role: input.role, is_active: input.is_active ? 1 : 0 })
      return ok(null)
    } catch (e) { log.error('users:update', e); return err('Failed', 'ERR_USERS') }
  })

  ipcMain.handle('users:resetPassword', (event, id: number, newPassword: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const hash = bcrypt.hashSync(newPassword, 12)
      userRepo.update(id, { password_hash: hash })
      return ok(null)
    } catch (e) { log.error('users:resetPassword', e); return err('Failed', 'ERR_USERS') }
  })

  ipcMain.handle('users:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (userRepo.countOwners() <= 1) {
        const target = userRepo.findById(id)
        if (target?.role === 'owner') return err('Cannot delete the last owner', 'ERR_USERS')
      }
      userRepo.delete(id)
      return ok(null)
    } catch (e) { log.error('users:delete', e); return err('Failed', 'ERR_USERS') }
  })

  // ── Permission overrides ────────────────────────────────────────────────────

  /** Returns role defaults as a flat string[] for a given role */
  ipcMain.handle('users:getRoleDefaults', (event, role: string) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(ROLE_DEFAULTS[role] ?? [])
    } catch (e) { log.error('users:getRoleDefaults', e); return err('Failed', 'ERR_USERS') }
  })

  /** Returns user-specific overrides (both grants and revocations) */
  ipcMain.handle('users:getUserOverrides', (event, userId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(userRepo.getUserOverrides(userId))
    } catch (e) { log.error('users:getUserOverrides', e); return err('Failed', 'ERR_USERS') }
  })

  /** Set a single permission override (grant=true or revoke=false) */
  ipcMain.handle('users:setOverride', (event, targetUserId: number, permKey: string, granted: boolean) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session?.permissions.includes('users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')

      // Security: no self-escalation
      if (session.userId === targetUserId) return err('Cannot modify your own permissions', 'ERR_FORBIDDEN')

      // Security: managers cannot modify owner accounts
      const target = userRepo.findById(targetUserId)
      if (!target) return err('User not found', 'ERR_NOT_FOUND')
      if (target.role === 'owner' && session.role !== 'owner') {
        return err('Cannot modify owner account permissions', 'ERR_FORBIDDEN')
      }

      // Security: managers cannot grant permissions they don't have
      if (granted && session.role !== 'owner' && !session.permissions.includes(permKey)) {
        return err('Cannot grant a permission you do not have', 'ERR_FORBIDDEN')
      }

      userRepo.setOverride(targetUserId, permKey, granted)

      try {
        activityLogRepo.log({
          userId: session.userId,
          action: 'permissions.change',
          entity: 'user',
          entityId: targetUserId,
          details: JSON.stringify({
            target: target.username,
            permission: permKey,
            change: granted ? 'granted' : 'revoked',
          }),
        })
      } catch {}

      return ok(null)
    } catch (e) { log.error('users:setOverride', e); return err('Failed', 'ERR_USERS') }
  })

  /** Remove a permission override — user reverts to role default */
  ipcMain.handle('users:removeOverride', (event, targetUserId: number, permKey: string) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session?.permissions.includes('users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (session.userId === targetUserId) return err('Cannot modify your own permissions', 'ERR_FORBIDDEN')

      const target = userRepo.findById(targetUserId)
      if (!target) return err('User not found', 'ERR_NOT_FOUND')
      if (target.role === 'owner' && session.role !== 'owner') {
        return err('Cannot modify owner account permissions', 'ERR_FORBIDDEN')
      }

      userRepo.removeOverride(targetUserId, permKey)

      try {
        activityLogRepo.log({
          userId: session.userId,
          action: 'permissions.change',
          entity: 'user',
          entityId: targetUserId,
          details: JSON.stringify({ target: target.username, permission: permKey, change: 'reset_to_default' }),
        })
      } catch {}

      return ok(null)
    } catch (e) { log.error('users:removeOverride', e); return err('Failed', 'ERR_USERS') }
  })

  // ── Legacy handlers (kept for backward compat) ─────────────────────────────

  ipcMain.handle('users:setPermissions', (event, id: number, perms: string[]) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      userRepo.setPermissions(id, perms)
      return ok(null)
    } catch (e) { log.error('users:setPermissions', e); return err('Failed', 'ERR_USERS') }
  })

  ipcMain.handle('users:getAllPermissions', (event) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(userRepo.getAllPermissions())
    } catch (e) { log.error('users:getAllPermissions', e); return err('Failed', 'ERR_USERS') }
  })

  ipcMain.handle('users:getUserPermissions', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'users.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      // Returns overrides for backward compat; UI should use getUserOverrides instead
      const overrides = userRepo.getUserOverrides(id)
      return ok(overrides.filter(o => o.granted).map(o => ({ key: o.key })))
    } catch (e) { log.error('users:getUserPermissions', e); return err('Failed', 'ERR_USERS') }
  })
}
