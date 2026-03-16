import { ipcMain } from 'electron'
import { settingsRepo } from '../database/repositories/settingsRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', () => {
    try {
      return ok(settingsRepo.getAll())
    } catch (e) {
      log.error('settings:getAll error:', e)
      return err('Failed to get settings', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      return ok(settingsRepo.get(key))
    } catch (e) {
      log.error('settings:get error:', e)
      return err('Failed to get setting', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    try {
      settingsRepo.set(key, value)
      return ok(null)
    } catch (e) {
      log.error('settings:set error:', e)
      return err('Failed to save setting', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:setBulk', (_event, entries: Record<string, string>) => {
    try {
      settingsRepo.setBulk(entries)
      return ok(null)
    } catch (e) {
      log.error('settings:setBulk error:', e)
      return err('Failed to save settings', 'ERR_SETTINGS')
    }
  })
}
