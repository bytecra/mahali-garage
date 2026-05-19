import { ipcMain } from 'electron'
import { buybackRepo } from '../database/repositories/buybackRepo'
import type { BuybackFilters } from '../database/repositories/buybackRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerBuybackHandlers(): void {
  ipcMain.handle('buybacks:list', (event, filters: BuybackFilters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(buybackRepo.list(filters))
    } catch (e) { log.error('buybacks:list', e); return err('Failed') }
  })

  ipcMain.handle('buybacks:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const row = buybackRepo.getById(id)
      return row ? ok(row) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) { log.error('buybacks:getById', e); return err('Failed') }
  })

  ipcMain.handle('buybacks:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = buybackRepo.create({ ...data, received_by: session?.userId ?? null })
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'buyback.create',
          entity: 'buyback',
          entityId: id,
          details: JSON.stringify({ device_type: data.device_type, brand: data.brand }),
        })
      } catch { /* non-critical */ }
      return ok(id)
    } catch (e) {
      log.error('buybacks:create', e)
      const msg = e instanceof Error ? e.message : 'Failed to create buyback'
      return err(msg)
    }
  })

  ipcMain.handle('buybacks:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      buybackRepo.update(id, data)
      return ok(true)
    } catch (e) { log.error('buybacks:update', e); return err('Failed') }
  })

  ipcMain.handle('buybacks:markSold', (event, id: number, resalePrice: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      buybackRepo.markSold(id, resalePrice)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'buyback.sold',
          entity: 'buyback',
          entityId: id,
          details: JSON.stringify({ resale_price: resalePrice }),
        })
      } catch { /* non-critical */ }
      return ok(true)
    } catch (e) { log.error('buybacks:markSold', e); return err('Failed') }
  })

  ipcMain.handle('buybacks:promoteToInventory', (event, id: number, productData: {
    name: string
    sell_price: number
    cost_price: number
    category_id?: number | null
  }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const productId = buybackRepo.promoteToInventory(id, productData)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'buyback.promoted',
          entity: 'buyback',
          entityId: id,
          details: JSON.stringify({ product_id: productId, name: productData.name }),
        })
      } catch { /* non-critical */ }
      return ok(productId)
    } catch (e) {
      log.error('buybacks:promoteToInventory', e)
      const msg = e instanceof Error ? e.message : 'Failed to promote to inventory'
      return err(msg)
    }
  })

  ipcMain.handle('buybacks:listByCustomer', (event, customerId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(buybackRepo.listByCustomer(customerId))
    } catch (e) {
      log.error('buybacks:listByCustomer', e)
      return err('Failed')
    }
  })

  ipcMain.handle('buybacks:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      buybackRepo.delete(id)
      return ok(true)
    } catch (e) { log.error('buybacks:delete', e); return err('Failed') }
  })
}
