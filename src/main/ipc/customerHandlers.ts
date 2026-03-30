import { ipcMain } from 'electron'
import { customerRepo } from '../database/repositories/customerRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerCustomerHandlers(): void {
  ipcMain.handle('customers:list', (_event, filters) => {
    try { return ok(customerRepo.list(filters)) }
    catch (e) { log.error('customers:list', e); return err('Failed to list customers') }
  })

  ipcMain.handle('customers:search', (_event, query) => {
    try { return ok(customerRepo.search(query)) }
    catch (e) { return err('Search failed') }
  })

  ipcMain.handle('customers:getById', (_event, id) => {
    try {
      const row = customerRepo.findById(id)
      if (!row) return err('Customer not found', 'ERR_NOT_FOUND')
      const sales        = customerRepo.getSalesHistory(id)
      const repairs      = customerRepo.getRepairHistory(id)
      const summaryStats = customerRepo.getSummaryStats(id)
      return ok({ ...row, sales, repairs, summaryStats })
    } catch (e) { log.error('customers:getById', e); return err('Failed to get customer') }
  })

  ipcMain.handle('customers:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'customers.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: customerRepo.create(data) }) }
    catch (e) { log.error('customers:create', e); return err('Failed to create customer') }
  })

  ipcMain.handle('customers:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'customers.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { customerRepo.update(id, data); return ok(null) }
    catch (e) { log.error('customers:update', e); return err('Failed to update customer') }
  })

  ipcMain.handle('customers:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'customers.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { customerRepo.delete(id); return ok(null) }
    catch (e) { log.error('customers:delete', e); return err('Failed to delete customer') }
  })
}
