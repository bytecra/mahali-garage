import { ipcMain } from 'electron'
import { notificationRepo } from '../database/repositories/notificationRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerNotificationHandlers(): void {
  ipcMain.handle('notifications:list', (event, limit?: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_AUTH')
      return ok(notificationRepo.list(session.userId, limit ?? 30))
    } catch (e) {
      log.error('notifications:list', e)
      return err('Failed to list notifications', 'ERR_NOTIF')
    }
  })

  ipcMain.handle('notifications:getUnreadCount', (event) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return ok(0)
      return ok(notificationRepo.getUnreadCount(session.userId))
    } catch (e) {
      log.error('notifications:getUnreadCount', e)
      return ok(0)
    }
  })

  ipcMain.handle('notifications:markRead', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_AUTH')
      notificationRepo.markRead(id, session.userId)
      return ok(null)
    } catch (e) {
      log.error('notifications:markRead', e)
      return err('Failed to mark notification read', 'ERR_NOTIF')
    }
  })

  ipcMain.handle('notifications:markAllRead', (event) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_AUTH')
      notificationRepo.markAllRead(session.userId)
      return ok(null)
    } catch (e) {
      log.error('notifications:markAllRead', e)
      return err('Failed to mark all read', 'ERR_NOTIF')
    }
  })
}
