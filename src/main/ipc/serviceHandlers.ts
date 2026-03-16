import { ipcMain } from 'electron'
import { serviceRepo } from '../database/repositories/serviceRepo'
import { authService } from '../services/authService'
import { hasFeature } from '../licensing/license-manager'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function requireLicense(feature: string): string | null {
  try {
    if (!hasFeature(feature)) return 'This feature requires PREMIUM license'
  } catch (e) {
    log.error('License check error', e)
    return null
  }
  return null
}

export function registerServiceHandlers(): void {
  ipcMain.handle('services:list', (event, filters) => {
    try {
      const licErr = requireLicense('services.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      return ok(serviceRepo.list(filters))
    } catch (e) { log.error('services:list', e); return err('Failed', 'ERR_SERVICES') }
  })

  ipcMain.handle('services:getById', (event, id: number) => {
    try {
      const licErr = requireLicense('services.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      const s = serviceRepo.getById(id)
      if (!s) return err('Not found', 'ERR_NOT_FOUND')
      return ok(s)
    } catch (e) { log.error('services:getById', e); return err('Failed', 'ERR_SERVICES') }
  })

  ipcMain.handle('services:create', (event, data) => {
    try {
      const licErr = requireLicense('services.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const id = serviceRepo.create(data)
      return ok({ id })
    } catch (e) { log.error('services:create', e); return err('Failed', 'ERR_SERVICES') }
  })

  ipcMain.handle('services:update', (event, id: number, data) => {
    try {
      const licErr = requireLicense('services.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(serviceRepo.update(id, data))
    } catch (e) { log.error('services:update', e); return err('Failed', 'ERR_SERVICES') }
  })

  ipcMain.handle('services:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('services.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(serviceRepo.delete(id))
    } catch (e) { log.error('services:delete', e); return err('Failed', 'ERR_SERVICES') }
  })

  ipcMain.handle('services:getCategories', () => {
    try {
      const licErr = requireLicense('services.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      return ok(serviceRepo.getCategories())
    } catch (e) { log.error('services:getCategories', e); return err('Failed', 'ERR_SERVICES') }
  })
}
