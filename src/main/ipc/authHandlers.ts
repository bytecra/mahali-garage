import { ipcMain } from 'electron'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

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

  ipcMain.handle('auth:changePassword', async (event, {
    currentPassword,
    newPassword,
  }: { currentPassword: string; newPassword: string }) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Not authenticated', 'ERR_UNAUTHENTICATED')

      const success = await authService.changePassword(session.userId, currentPassword, newPassword)
      if (!success) return err('Current password is incorrect', 'ERR_WRONG_PASSWORD')

      return ok(null)
    } catch (e) {
      log.error('Change password error:', e)
      return err('Failed to change password', 'ERR_CHANGE_PASSWORD')
    }
  })
}
