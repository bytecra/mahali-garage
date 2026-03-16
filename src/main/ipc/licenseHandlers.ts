import { ipcMain } from 'electron'
import * as licenseManager from '../licensing/license-manager'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'
import { getDb } from '../database'

export function registerLicenseHandlers(): void {
  ipcMain.handle('license:check', (_event) => {
    try {
      return ok(licenseManager.checkLicense())
    } catch (e) {
      log.error('license:check', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:activate', (_event, key: string) => {
    try {
      if (!key || typeof key !== 'string') {
        return err('Invalid license key', 'ERR_INVALID_PARAM')
      }
      const trimmed = key.trim()
      if (trimmed.length < 50) {
        return err('License key too short', 'ERR_INVALID_LICENSE')
      }
      const result = licenseManager.activateLicense(trimmed)
      return ok(result)
    } catch (e) {
      log.error('license:activate', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:getStatus', (_event) => {
    try {
      return ok(licenseManager.getLicenseInfo())
    } catch (e) {
      log.error('license:getStatus', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:getHwId', (_event) => {
    try {
      return ok(licenseManager.getCurrentDeviceId())
    } catch (e) {
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:getInfo', () => {
    try {
      return ok(licenseManager.getTieredLicenseInfo())
    } catch (e) {
      log.error('license:getInfo', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  const VALID_FEATURES = new Set([
    'dashboard.view',
    'pos',
    'inventory.view',
    'inventory.edit',
    'customers.view',
    'customers.edit',
    'settings.view',
    'settings.edit',
    'reports.view',
    'reports.export',
    'expenses.view',
    'expenses.add',
    'tasks.view',
    'tasks.add',
    'calendar.view',
    'invoices.view',
    'invoices.edit',
    'repairs.view',
    'repairs.edit',
    'users.advanced_permissions',
    'activity_log.view',
    'backup.manage',
  ])

  ipcMain.handle('license:hasFeature', (_event, feature: string) => {
    try {
      if (!feature || typeof feature !== 'string') {
        return err('Invalid feature parameter', 'ERR_INVALID_PARAM')
      }
      if (!VALID_FEATURES.has(feature)) {
        log.warn('license:hasFeature unknown feature', feature)
        return ok(false)
      }
      return ok(licenseManager.hasFeature(feature))
    } catch (e) {
      log.error('license:hasFeature', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:getTier', () => {
    try {
      return ok(licenseManager.getTieredLicenseInfo().tier)
    } catch (e) {
      log.error('license:getTier', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })

  ipcMain.handle('license:canAddUser', () => {
    try {
      const info = licenseManager.getTieredLicenseInfo()
      const maxUsers = info.maxUsers
      if (maxUsers === -1) return ok(true)

      const db = getDb()
      const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }
      const current = row?.cnt ?? 0
      return ok(current < maxUsers)
    } catch (e) {
      log.error('license:canAddUser', e)
      return err('Failed', 'ERR_LICENSE')
    }
  })
}
