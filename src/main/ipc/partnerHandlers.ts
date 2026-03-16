import { ipcMain } from 'electron'
import { partnerRepo } from '../database/repositories/partnerRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerPartnerHandlers(): void {
  ipcMain.handle('partners:list', (_event, filters) => {
    try { return ok(partnerRepo.list(filters)) }
    catch (e) { log.error('partners:list', e); return err('Failed to list partners') }
  })

  ipcMain.handle('partners:getById', (_event, id) => {
    try {
      const row = partnerRepo.findById(id)
      return row ? ok(row) : err('Partner not found', 'ERR_NOT_FOUND')
    } catch (e) { log.error('partners:getById', e); return err('Failed to get partner') }
  })

  ipcMain.handle('partners:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: partnerRepo.create(data) }) }
    catch (e) { log.error('partners:create', e); return err('Failed to create partner') }
  })

  ipcMain.handle('partners:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { partnerRepo.update(id, data); return ok(null) }
    catch (e) { log.error('partners:update', e); return err('Failed to update partner') }
  })

  ipcMain.handle('partners:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { partnerRepo.delete(id); return ok(null) }
    catch (e) { log.error('partners:delete', e); return err('Failed to delete partner') }
  })
}
