import { ipcMain, dialog, shell } from 'electron'
import { backupService } from '../services/backupService'
import { getBackupSettings, updateBackupSettings, performBackup } from '../services/backupScheduler'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerBackupHandlers(): void {
  // ── Existing manual backup/restore ──────────────────────────────────────

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

  // ── Scheduled backup settings ──────────────────────────────────────────

  ipcMain.handle('backup:getSettings', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(getBackupSettings())
    } catch (e) { log.error('backup:getSettings', e); return err('Failed') }
  })

  ipcMain.handle('backup:updateSettings', (event, data) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || session.role !== 'owner') return err('Only the owner can change backup settings', 'ERR_FORBIDDEN')
      updateBackupSettings(data)
      return ok(true)
    } catch (e) { log.error('backup:updateSettings', e); return err('Failed') }
  })

  ipcMain.handle('backup:runNow', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(performBackup())
    } catch (e) { log.error('backup:runNow', e); return err('Failed') }
  })

  ipcMain.handle('backup:chooseFolder', async (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose Backup Location',
        buttonLabel: 'Select Folder',
      })
      return ok(result.canceled ? null : result.filePaths[0])
    } catch (e) { log.error('backup:chooseFolder', e); return err('Failed') }
  })

  ipcMain.handle('backup:openFolder', async (event, folderPath: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'backup.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      await shell.openPath(folderPath)
      return ok(true)
    } catch (e) { log.error('backup:openFolder', e); return err('Failed') }
  })
}
