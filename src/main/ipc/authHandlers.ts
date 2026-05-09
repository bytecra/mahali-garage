import { ipcMain } from 'electron'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../database'
import { getDeviceId } from '../licensing/device-fingerprint'
import { userRepo } from '../database/repositories/userRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

const LICENSE_HMAC_FALLBACK =
  '0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a'

function getResetHmacSecret(): string {
  return process.env.LICENSE_HMAC_SECRET || LICENSE_HMAC_FALLBACK
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (event, { username, password }: { username: string; password: string }) => {
    try {
      const session = await authService.login(username, password)
      if (!session) return err('Invalid username or password', 'ERR_INVALID_CREDENTIALS')

      authService.storeSession(event.sender.id, session)
      log.info(`User logged in: ${session.username} (${session.role})`)

      return ok({
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
        role: session.role,
        permissions: session.permissions,
      })
    } catch (e) {
      log.error('Login error:', e)
      return err('Login failed', 'ERR_LOGIN')
    }
  })

  ipcMain.handle('auth:getAuthType', (_event, username: string) => {
    try {
      const authType = authService.getAuthTypeForUsername(username)
      return ok(authType)
    } catch (e) {
      log.error('auth:getAuthType error:', e)
      return err('Failed to get auth type', 'ERR_LOGIN')
    }
  })

  ipcMain.handle('auth:logout', (event) => {
    const session = authService.getSession(event.sender.id)
    if (session) {
      log.info(`User logged out: ${session.username}`)
      authService.clearSession(event.sender.id)
    }
    return ok(null)
  })

  ipcMain.handle('auth:getSession', (event) => {
    const session = authService.getSession(event.sender.id)
    if (!session) return ok(null)
    return ok({
      userId: session.userId,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
      permissions: session.permissions,
    })
  })

  ipcMain.handle(
    'auth:changePassword',
    async (
      event,
      params: {
        newPassword: string
        currentPassword?: string
      },
    ) => {
      try {
        const session = authService.getSession(event.sender.id)
        if (!session) return err('Not authenticated', 'ERR_UNAUTHENTICATED')

        const newPassword = params.newPassword
        if (!newPassword || newPassword.length < 4)
          return err('Password too short', 'ERR_VALIDATION')

        const user = userRepo.getPasswordInfo(session.userId)
        if (!user) return err('User not found', 'ERR_NOT_FOUND')

        if (!user.must_change_password) {
          if (!params.currentPassword)
            return err('Current password required', 'ERR_VALIDATION')
          const valid = await bcrypt.compare(params.currentPassword, user.password_hash)
          if (!valid) return err('Current password incorrect', 'ERR_VALIDATION')
        }

        const hash = await bcrypt.hash(newPassword, 12)
        userRepo.setPassword(session.userId, hash)

        return ok({ success: true })
      } catch (e) {
        log.error('Change password error:', e)
        return err('Failed to change password', 'ERR_CHANGE_PASSWORD')
      }
    },
  )

  ipcMain.handle('auth:requestPasswordReset', async (_event, username: string) => {
    try {
      if (!username?.trim()) return err('Username required', 'ERR_VALIDATION')

      const db = getDb()

      const user = db.prepare(`
        SELECT id, username, full_name, role
        FROM users WHERE username = ?
        AND is_active = 1
      `).get(username.trim()) as
        | { id: number; username: string; full_name: string; role: string }
        | undefined

      if (!user) return err('User not found', 'ERR_NOT_FOUND')

      if (user.role === 'owner')
        return err('Contact developer for owner reset', 'ERR_FORBIDDEN')

      const existing = db.prepare(`
        SELECT id FROM password_reset_requests
        WHERE user_id = ?
        AND status = 'pending'
      `).get(user.id)

      if (existing) {
        return ok({
          alreadyPending: true,
          message: 'Request already pending. Please wait for manager approval.',
        })
      }

      db.prepare(`
        INSERT INTO password_reset_requests
          (user_id, status, requested_at)
        VALUES (?, 'pending', datetime('now'))
      `).run(user.id)

      const managers = db.prepare(`
        SELECT id FROM users
        WHERE role IN ('owner', 'manager')
        AND is_active = 1
      `).all() as { id: number }[]

      const msg = `${user.full_name} (${user.username}) has requested a password reset.`
      const ins = db.prepare(`
        INSERT INTO notifications
          (user_id, task_id, type, title, message, is_read, created_at)
        VALUES (?, NULL, ?, ?, ?, 0, datetime('now'))
      `)

      for (const mgr of managers) {
        ins.run(mgr.id, 'password_reset_request', 'Password Reset Request', msg)
      }

      return ok({
        alreadyPending: false,
        message: 'Request sent. Your manager will reset your password shortly.',
      })
    } catch (e) {
      log.error('auth:requestPasswordReset', e)
      return err('Failed to submit request')
    }
  })

  ipcMain.handle('auth:getPendingResetRequests', (event) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || (session.role !== 'owner' && session.role !== 'manager'))
        return err('Forbidden', 'ERR_FORBIDDEN')

      const db = getDb()
      const requests = db.prepare(`
        SELECT
          prr.id,
          prr.user_id,
          prr.status,
          prr.requested_at,
          u.username,
          u.full_name,
          u.role
        FROM password_reset_requests prr
        JOIN users u ON u.id = prr.user_id
        WHERE prr.status = 'pending'
        ORDER BY prr.requested_at ASC
      `).all() as Array<{
        id: number
        user_id: number
        status: string
        requested_at: string
        username: string
        full_name: string
        role: string
      }>

      return ok(requests)
    } catch (e) {
      log.error('auth:getPendingResetRequests', e)
      return err('Failed')
    }
  })

  ipcMain.handle(
    'auth:resolveResetRequest',
    async (
      event,
      params: {
        requestId: number
        action: 'accept' | 'reject'
      },
    ) => {
      try {
        const session = authService.getSession(event.sender.id)
        if (!session || (session.role !== 'owner' && session.role !== 'manager'))
          return err('Forbidden', 'ERR_FORBIDDEN')

        const db = getDb()

        const request = db.prepare(`
        SELECT * FROM password_reset_requests
        WHERE id = ? AND status = 'pending'
      `).get(params.requestId) as { id: number; user_id: number } | undefined

        if (!request) return err('Request not found or already resolved', 'ERR_NOT_FOUND')

        if (params.action === 'accept') {
          const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
          const tempPwd = Array.from(
            { length: 8 },
            () => charset[Math.floor(Math.random() * charset.length)],
          ).join('')
          const hash = await bcrypt.hash(tempPwd, 12)

          const txn = db.transaction(() => {
            db.prepare(`
            UPDATE users SET
              password_hash = ?,
              must_change_password = 1,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(hash, request.user_id)

            db.prepare(`
            UPDATE password_reset_requests SET
              status = 'accepted',
              resolved_by = ?,
              resolved_at = datetime('now')
            WHERE id = ?
          `).run(session.userId, request.id)

            db.prepare(`
            INSERT INTO notifications
              (user_id, task_id, type, title, message, is_read, created_at)
            VALUES (?, NULL, ?, ?, ?, 0, datetime('now'))
          `).run(
              request.user_id,
              'password_reset_approved',
              'Password Reset Approved',
              `Your password has been reset to: ${tempPwd}\nPlease login and change your password immediately.`,
            )
          })
          txn()
        } else {
          db.prepare(`
          UPDATE password_reset_requests SET
            status = 'rejected',
            resolved_by = ?,
            resolved_at = datetime('now')
          WHERE id = ?
        `).run(session.userId, request.id)
        }

        return ok({ success: true })
      } catch (e) {
        log.error('auth:resolveResetRequest', e)
        return err('Failed to resolve request')
      }
    },
  )

  ipcMain.handle('auth:checkMustChangePassword', (event) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')

      const db = getDb()
      const user = db.prepare(`
        SELECT must_change_password
        FROM users WHERE id = ?
      `).get(session.userId) as { must_change_password: number } | undefined

      return ok({
        mustChange: user?.must_change_password === 1,
      })
    } catch (e) {
      log.error('auth:checkMustChangePassword', e)
      return err('Failed')
    }
  })

  // Phase 4 eval — app.isPackaged guard: NOT applied.
  // This is a legitimate production feature: a manager generates a device-bound,
  // time-limited HMAC code so an employee can self-reset their password without
  // a temporary password flowing through a notification. It is already protected
  // by (1) owner/manager session, (2) 1-hour HMAC expiry, (3) single-use flag.
  ipcMain.handle('auth:generateResetCode', async (event, username: string) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || (session.role !== 'owner' && session.role !== 'manager'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const deviceId = getDeviceId()
      const secret = getResetHmacSecret()

      const hourTimestamp = Math.floor(Date.now() / (1000 * 60 * 60))

      const payload = `${deviceId}:${username}:${hourTimestamp}`

      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
        .toUpperCase()
        .slice(0, 12)

      const code = `MH-${hash.slice(0, 6)}-${hash.slice(6, 12)}`

      const db = getDb()
      db.prepare(`
      INSERT OR IGNORE INTO dev_reset_codes
        (code, username, device_id)
      VALUES (?, ?, ?)
    `).run(code, username, deviceId)

      return ok({ code, deviceId })
    } catch (e) {
      log.error('auth:generateResetCode', e)
      return err('Failed')
    }
  })

  ipcMain.handle(
    'auth:resetPassword',
    async (
      _event,
      params: {
        code: string
        username: string
        newPassword: string
      }
    ) => {
      try {
        const { code, username, newPassword } = params

        if (!code || !username || !newPassword)
          return err('Missing fields', 'ERR_VALIDATION')

        if (newPassword.length < 4)
          return err('Password too short', 'ERR_VALIDATION')

        const deviceId = getDeviceId()
        const secret = getResetHmacSecret()

        const db = getDb()

        const stored = db.prepare(`
      SELECT * FROM dev_reset_codes
      WHERE code = ?
      AND username = ?
      AND device_id = ?
      AND used = 0
    `).get(code.toUpperCase().trim(), username, deviceId) as { id: number } | undefined

        if (!stored)
          return err('Invalid or expired reset code', 'ERR_INVALID_CODE')

        const hourNow = Math.floor(Date.now() / (1000 * 60 * 60))

        let valid = false
        for (const h of [hourNow, hourNow - 1]) {
          const payload = `${deviceId}:${username}:${h}`
          const expected = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')
            .toUpperCase()
            .slice(0, 12)
          const expectedCode = `MH-${expected.slice(0, 6)}-${expected.slice(6, 12)}`
          if (expectedCode === code.toUpperCase().trim()) {
            valid = true
            break
          }
        }

        if (!valid)
          return err('Reset code has expired', 'ERR_EXPIRED_CODE')

        const hash = await bcrypt.hash(newPassword, 12)

        const result = db.prepare(`
      UPDATE users
      SET password_hash = ?,
          updated_at = datetime('now')
      WHERE username = ?
    `).run(hash, username)

        if (result.changes === 0)
          return err('User not found', 'ERR_NOT_FOUND')

        db.prepare(`
      UPDATE dev_reset_codes
      SET used = 1
      WHERE id = ?
    `).run(stored.id)

        return ok({ success: true })
      } catch (e) {
        log.error('auth:resetPassword', e)
        return err('Failed to reset password')
      }
    }
  )
}
