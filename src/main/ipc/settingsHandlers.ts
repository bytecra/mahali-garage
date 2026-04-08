import { ipcMain } from 'electron'
import { settingsRepo } from '../database/repositories/settingsRepo'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
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

  ipcMain.handle('settings:getStoreStartDateMeta', (event) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      const stored = settingsRepo.getWithMeta('store.start_date')
      return ok({
        value: stored.value,
        updatedAt: stored.updated_at,
        effectiveValue: settingsRepo.getEffectiveStoreStartDate(),
        earliestBusinessDate: settingsRepo.getEarliestBusinessDate(),
        latestBusinessDate: settingsRepo.getLatestBusinessDate(),
      })
    } catch (e) {
      log.error('settings:getStoreStartDateMeta error:', e)
      return err('Failed to get store start date', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:setStoreStartDate', (event, value: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const v = (value ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return err('Invalid date format', 'ERR_VALIDATION')
      const today = new Date().toISOString().slice(0, 10)
      if (v > today) return err('Store start date cannot be in the future', 'ERR_VALIDATION')
      const latest = settingsRepo.getLatestBusinessDate()
      if (latest && v > latest) {
        return err(`Store start date cannot be after latest transaction (${latest})`, 'ERR_VALIDATION')
      }
      const before = settingsRepo.getStoreStartDate()
      settingsRepo.set('store.start_date', v)
      const session = authService.getSession(event.sender.id)
      activityLogRepo.log({
        userId: session?.userId ?? null,
        action: 'settings.store_start_date.updated',
        entity: 'settings',
        details: JSON.stringify({ oldValue: before, newValue: v }),
      })
      return ok({ value: v })
    } catch (e) {
      log.error('settings:setStoreStartDate error:', e)
      return err('Failed to save store start date', 'ERR_SETTINGS')
    }
  })

  ipcMain.handle('settings:clearStoreStartDate', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const before = settingsRepo.getStoreStartDate()
      settingsRepo.set('store.start_date', '')
      const session = authService.getSession(event.sender.id)
      activityLogRepo.log({
        userId: session?.userId ?? null,
        action: 'settings.store_start_date.cleared',
        entity: 'settings',
        details: JSON.stringify({ oldValue: before, newValue: null }),
      })
      return ok(null)
    } catch (e) {
      log.error('settings:clearStoreStartDate error:', e)
      return err('Failed to clear store start date', 'ERR_SETTINGS')
    }
  })
}
