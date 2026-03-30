import { ipcMain } from 'electron'
import { assetRepo } from '../database/repositories/assetRepo'
import { authService } from '../services/authService'
import { hasFeature } from '../licensing/license-manager'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function requireAssetsLicense(): string | null {
  try {
    if (!hasFeature('assets.view')) return 'An active license is required'
  } catch (e) {
    log.error('License check error', e)
    return null
  }
  return null
}

export function registerAssetHandlers(): void {
  ipcMain.handle('assets:list', (event, filters) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const f = filters ?? {}
      const purchaseSumFiltered = assetRepo.filteredPurchaseSum({
        search: f.search,
        category: f.category,
      })
      return ok({ ...assetRepo.list(f), purchaseSumFiltered })
    } catch (e) {
      log.error('assets:list', e)
      return err('Failed to list assets', 'ERR_ASSETS')
    }
  })

  ipcMain.handle('assets:categories', (event) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(assetRepo.distinctCategories())
    } catch (e) {
      log.error('assets:categories', e)
      return err('Failed', 'ERR_ASSETS')
    }
  })

  ipcMain.handle('assets:getById', (event, id: number) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const row = assetRepo.getById(id)
      return row ? ok(row) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) {
      log.error('assets:getById', e)
      return err('Failed', 'ERR_ASSETS')
    }
  })

  ipcMain.handle('assets:create', (event, data) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      const id = assetRepo.create(data)
      return ok({ id })
    } catch (e: unknown) {
      log.error('assets:create', e)
      const msg = e instanceof Error ? e.message : 'Failed to create asset'
      return err(msg, 'ERR_ASSETS')
    }
  })

  ipcMain.handle('assets:update', (event, id: number, data) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      assetRepo.update(id, data)
      return ok(null)
    } catch (e: unknown) {
      log.error('assets:update', e)
      const msg = e instanceof Error ? e.message : 'Failed to update asset'
      return err(msg, 'ERR_ASSETS')
    }
  })

  ipcMain.handle('assets:delete', (event, id: number) => {
    try {
      const licErr = requireAssetsLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'assets.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!assetRepo.delete(id)) return err('Not found', 'ERR_NOT_FOUND')
      return ok(null)
    } catch (e) {
      log.error('assets:delete', e)
      return err('Failed to delete', 'ERR_ASSETS')
    }
  })
}
