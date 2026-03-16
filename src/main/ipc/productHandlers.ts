import { ipcMain } from 'electron'
import { productRepo } from '../database/repositories/productRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerProductHandlers(): void {
  ipcMain.handle('products:list', (_event, filters) => {
    try { return ok(productRepo.list(filters)) }
    catch (e) { log.error('products:list', e); return err('Failed to list products') }
  })

  ipcMain.handle('products:getById', (_event, id) => {
    try {
      const row = productRepo.findById(id)
      return row ? ok(row) : err('Product not found', 'ERR_NOT_FOUND')
    } catch (e) { log.error('products:getById', e); return err('Failed to get product') }
  })

  ipcMain.handle('products:search', (_event, query) => {
    try { return ok(productRepo.search(query)) }
    catch (e) { log.error('products:search', e); return err('Search failed') }
  })

  ipcMain.handle('products:findByBarcode', (_event, barcode) => {
    try {
      const row = productRepo.findByBarcode(barcode)
      return row ? ok(row) : err('Product not found', 'ERR_NOT_FOUND')
    } catch (e) { return err('Barcode lookup failed') }
  })

  ipcMain.handle('products:getLowStock', () => {
    try { return ok(productRepo.getLowStock()) }
    catch (e) { return err('Failed to get low stock') }
  })

  ipcMain.handle('products:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: productRepo.create(data) }) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE')
        ? 'SKU or barcode already exists' : 'Failed to create product'
      return err(msg)
    }
  })

  ipcMain.handle('products:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { productRepo.update(id, data); return ok(null) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE')
        ? 'SKU or barcode already exists' : 'Failed to update product'
      return err(msg)
    }
  })

  ipcMain.handle('products:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { productRepo.delete(id); return ok(null) }
    catch (e) { log.error('products:delete', e); return err('Failed to delete product') }
  })

  ipcMain.handle('products:adjustStock', (event, id, adjustment) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.adjust_stock'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try {
      const session = authService.getSession(event.sender.id)
      productRepo.adjustStock(id, session?.userId ?? null, adjustment)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? null,
          action: 'stock.adjust',
          entity: 'product',
          entityId: id,
          details: JSON.stringify({ type: adjustment.type, qty: adjustment.quantity, reason: adjustment.reason }),
        })
      } catch { /* non-critical */ }
      return ok(null)
    } catch (e) { log.error('products:adjustStock', e); return err('Failed to adjust stock') }
  })

  ipcMain.handle('products:getStockHistory', (_event, id) => {
    try { return ok(productRepo.getStockHistory(id)) }
    catch (e) { return err('Failed to get stock history') }
  })
}
