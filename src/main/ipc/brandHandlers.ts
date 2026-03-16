import { ipcMain } from 'electron'
import { brandRepo } from '../database/repositories/brandRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerBrandHandlers(): void {
  ipcMain.handle('brands:list', () => {
    try { return ok(brandRepo.list()) }
    catch (e) { log.error('brands:list', e); return err('Failed to list brands') }
  })

  ipcMain.handle('brands:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: brandRepo.create(data) }) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Brand name already exists' : 'Failed to create brand'
      return err(msg)
    }
  })

  ipcMain.handle('brands:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { brandRepo.update(id, data); return ok(null) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Brand name already exists' : 'Failed to update brand'
      return err(msg)
    }
  })

  ipcMain.handle('brands:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try {
      if (brandRepo.hasProducts(id))
        return err('Cannot delete brand with active products', 'ERR_HAS_PRODUCTS')
      brandRepo.delete(id)
      return ok(null)
    } catch (e) { log.error('brands:delete', e); return err('Failed to delete brand') }
  })
}
