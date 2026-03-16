import { ipcMain } from 'electron'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerActivityHandlers(): void {
  ipcMain.handle('activity:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'activity_log.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(activityLogRepo.list(filters))
    } catch (e) { log.error('activity:list', e); return err('Failed to list activity log') }
  })
}
