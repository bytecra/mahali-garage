import { ipcMain } from 'electron'
import { saleRepo } from '../database/repositories/saleRepo'
import { loyaltyRepo } from '../database/repositories/loyaltyRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerSaleHandlers(): void {
  ipcMain.handle('sales:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(saleRepo.list(filters))
    } catch (e) { log.error('sales:list', e); return err('Failed to list sales', 'ERR_SALES') }
  })

  ipcMain.handle('sales:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const sale = saleRepo.getById(id)
      if (!sale) return err('Sale not found', 'ERR_NOT_FOUND')
      return ok(sale)
    } catch (e) { log.error('sales:getById', e); return err('Failed to get sale', 'ERR_SALES') }
  })

  ipcMain.handle('sales:create', (event, input) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = saleRepo.create({ ...input, user_id: session!.userId }) as { sale_id: number; invoice_number: string }
      try {
        activityLogRepo.log({
          userId: session!.userId,
          action: 'sale.create',
          entity: 'sale',
          entityId: result.sale_id,
          details: JSON.stringify({ invoice: result.invoice_number, total: input.total_amount }),
        })
      } catch { /* non-critical */ }
      if (input.customer_id && result.sale_id) {
        try {
          loyaltyRepo.processAutoEarn({
            customer_id: Number(input.customer_id),
            amount: Number(input.total_amount) || 0,
            source: 'invoice',
            source_id: Number(result.sale_id),
            created_by: session!.userId,
          })
        } catch { /* non-fatal */ }
      }
      return ok(result)
    } catch (e: unknown) {
      log.error('sales:create', e)
      const msg = e instanceof Error ? e.message : 'Failed to create sale'
      return err(msg, 'ERR_SALES')
    }
  })

  ipcMain.handle('sales:void', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.void')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = saleRepo.void(id, session!.userId)
      try {
        activityLogRepo.log({ userId: session!.userId, action: 'sale.void', entity: 'sale', entityId: id })
      } catch { /* non-critical */ }
      return ok(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to void sale'
      return err(msg, 'ERR_SALES')
    }
  })

  ipcMain.handle('sales:addPayment', (event, saleId: number, payment) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(saleRepo.addPayment(saleId, payment))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add payment'
      return err(msg, 'ERR_SALES')
    }
  })

  ipcMain.handle('sales:getDrafts', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      return ok(saleRepo.getDrafts(session!.userId))
    } catch (e) { log.error('sales:getDrafts', e); return err('Failed', 'ERR_SALES') }
  })

  ipcMain.handle('sales:saveDraft', (event, input) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      return ok(saleRepo.saveDraft({ ...input, user_id: session!.userId }))
    } catch (e) { log.error('sales:saveDraft', e); return err('Failed', 'ERR_SALES') }
  })

  ipcMain.handle('sales:getDraftById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(saleRepo.getDraftById(id))
    } catch (e) { log.error('sales:getDraftById', e); return err('Failed', 'ERR_SALES') }
  })

  ipcMain.handle('sales:deleteDraft', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(saleRepo.deleteDraft(id))
    } catch (e) { log.error('sales:deleteDraft', e); return err('Failed', 'ERR_SALES') }
  })
}
