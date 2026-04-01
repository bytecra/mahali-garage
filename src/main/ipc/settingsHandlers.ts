import { ipcMain } from 'electron'
import { settingsRepo } from '../database/repositories/settingsRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', (event) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(settingsRepo.getAll())
    } catch (e) {
      log.error('settings:getAll error:', e)
      return err('Failed to get settings', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:get', (event, key: string) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(settingsRepo.get(key))
    } catch (e) {
      log.error('settings:get error:', e)
      return err('Failed to get setting', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:set', (event, key: string, value: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      settingsRepo.set(key, value)
      return ok(null)
    } catch (e) {
      log.error('settings:set error:', e)
      return err('Failed to save setting', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:setBulk', (event, entries: Record<string, string>) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      settingsRepo.setBulk(entries)
      return ok(null)
    } catch (e) {
      log.error('settings:setBulk error:', e)
      return err('Failed to save settings', 'ERR_SETTINGS')
    }
  })
}
