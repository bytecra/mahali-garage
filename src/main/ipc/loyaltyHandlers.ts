import { ipcMain } from 'electron'
import {
  addTransaction,
  getLoyalty,
  getTransactions,
  processAutoEarn,
} from '../database/repositories/loyaltyRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerLoyaltyHandlers(): void {
  ipcMain.handle('loyalty:get', (event, customerId: number) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (typeof customerId !== 'number' || !Number.isFinite(customerId)) {
        return err('Invalid customer id', 'ERR_LOYALTY')
      }
      return ok(getLoyalty(customerId))
    } catch (e) {
      log.error('loyalty:get', e)
      return err('Failed', 'ERR_LOYALTY')
    }
  })

  ipcMain.handle(
    'loyalty:addTransaction',
    (
      event,
      data: {
        customer_id: number
        type: string
        points_delta: number
        stamps_delta: number
        visits_delta: number
        source?: string
        source_id?: number
        note?: string
        created_by?: number
      }
    ) => {
      try {
        if (!authService.hasPermission(event.sender.id, 'sales.create')) {
          return err('Forbidden', 'ERR_FORBIDDEN')
        }
        addTransaction(data)
        return ok(null)
      } catch (e) {
        log.error('loyalty:addTransaction', e)
        return err('Failed', 'ERR_LOYALTY')
      }
    }
  )

  ipcMain.handle('loyalty:getTransactions', (event, customerId: number, limit?: number) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (typeof customerId !== 'number' || !Number.isFinite(customerId)) {
        return err('Invalid customer id', 'ERR_LOYALTY')
      }
      const lim = typeof limit === 'number' && limit > 0 ? limit : 20
      return ok(getTransactions(customerId, lim))
    } catch (e) {
      log.error('loyalty:getTransactions', e)
      return err('Failed', 'ERR_LOYALTY')
    }
  })

  ipcMain.handle(
    'loyalty:processAutoEarn',
    (
      event,
      params: {
        customerId: number
        amount: number
        source: 'invoice' | 'receipt'
        sourceId: number
        createdBy: number
      }
    ) => {
      try {
        if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
        const { customerId, amount, source, sourceId, createdBy } = params
        if (typeof customerId !== 'number' || !Number.isFinite(customerId)) {
          return err('Invalid customer id', 'ERR_LOYALTY')
        }
        processAutoEarn(customerId, amount, source, sourceId, createdBy)
        return ok(null)
      } catch (e) {
        log.error('loyalty:processAutoEarn', e)
        return err('Failed', 'ERR_LOYALTY')
      }
    }
  )
}
