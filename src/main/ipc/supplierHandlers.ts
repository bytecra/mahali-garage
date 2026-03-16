import { ipcMain } from 'electron'
import { supplierRepo } from '../database/repositories/supplierRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerSupplierHandlers(): void {
  ipcMain.handle('suppliers:list', (_event, filters) => {
    try { return ok(supplierRepo.list(filters)) }
    catch (e) { log.error('suppliers:list', e); return err('Failed to list suppliers') }
  })

  ipcMain.handle('suppliers:listAll', () => {
    try { return ok(supplierRepo.listAll()) }
    catch (e) { return err('Failed to list suppliers') }
  })

  ipcMain.handle('suppliers:getById', (_event, id) => {
    try {
      const row = supplierRepo.findById(id)
      return row ? ok(row) : err('Supplier not found', 'ERR_NOT_FOUND')
    } catch (e) { log.error('suppliers:getById', e); return err('Failed to get supplier') }
  })

  ipcMain.handle('suppliers:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: supplierRepo.create(data) }) }
    catch (e) { log.error('suppliers:create', e); return err('Failed to create supplier') }
  })

  ipcMain.handle('suppliers:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { supplierRepo.update(id, data); return ok(null) }
    catch (e) { log.error('suppliers:update', e); return err('Failed to update supplier') }
  })

  ipcMain.handle('suppliers:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { supplierRepo.delete(id); return ok(null) }
    catch (e) { log.error('suppliers:delete', e); return err('Failed to delete supplier') }
  })
}
