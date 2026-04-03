import { ipcMain } from 'electron'
import { customReceiptRepo } from '../database/repositories/customReceiptRepo'
import * as loyaltyRepo from '../database/repositories/loyaltyRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerCustomReceiptHandlers(): void {
  ipcMain.handle('customReceipts:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(customReceiptRepo.list(filters))
    } catch (e) {
      log.error('customReceipts:list', e)
      return err('Failed')
    }
  })

  ipcMain.handle('customReceipts:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const receipt = customReceiptRepo.getById(id)
      return receipt ? ok(receipt) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) {
      log.error('customReceipts:getById', e)
      return err('Failed')
    }
  })

  ipcMain.handle('customReceipts:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Not authenticated', 'ERR_FORBIDDEN')
      const result = customReceiptRepo.create({
        ...data,
        created_by: session.userId,
      })
      if (data.customer_id && result.id) {
        try {
          loyaltyRepo.processAutoEarn(
            data.customer_id,
            data.amount,
            'receipt',
            result.id,
            session.userId
          )
        } catch { /* non-fatal, don't fail receipt */ }
      }
      return ok(result)
    } catch (e) {
      log.error('customReceipts:create', e)
      return err('Failed to create receipt')
    }
  })

  ipcMain.handle('customReceipts:delete', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session || !['owner', 'manager'].includes(session.role))
        return err('Forbidden', 'ERR_FORBIDDEN')
      customReceiptRepo.delete(id)
      return ok(true)
    } catch (e) {
      log.error('customReceipts:delete', e)
      return err('Failed')
    }
  })
}
