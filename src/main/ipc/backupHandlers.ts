import { ipcMain } from 'electron'
import { backupService } from '../services/backupService'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:create', async (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(await backupService.create())
    } catch (e) { log.error('backup:create', e); return err('Failed', 'ERR_BACKUP') }
  })

  ipcMain.handle('backup:selectFile', async (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(await backupService.selectFile())
    } catch (e) { log.error('backup:selectFile', e); return err('Failed', 'ERR_BACKUP') }
  })

  ipcMain.handle('backup:restore', async (event, filePath: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(await backupService.restore(filePath))
    } catch (e) { log.error('backup:restore', e); return err('Failed', 'ERR_BACKUP') }
  })
}
