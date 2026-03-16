import { ipcMain } from 'electron'
import { categoryRepo } from '../database/repositories/categoryRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerCategoryHandlers(): void {
  ipcMain.handle('categories:list', () => {
    try { return ok(categoryRepo.list()) }
    catch (e) { log.error('categories:list', e); return err('Failed to list categories') }
  })

  ipcMain.handle('categories:create', (event, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { return ok({ id: categoryRepo.create(data) }) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Category name already exists' : 'Failed to create category'
      return err(msg)
    }
  })

  ipcMain.handle('categories:update', (event, id, data) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.edit'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try { categoryRepo.update(id, data); return ok(null) }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Category name already exists' : 'Failed to update category'
      return err(msg)
    }
  })

  ipcMain.handle('categories:delete', (event, id) => {
    if (!authService.hasPermission(event.sender.id, 'inventory.delete'))
      return err('Permission denied', 'ERR_FORBIDDEN')
    try {
      if (categoryRepo.hasProducts(id))
        return err('Cannot delete category with active products', 'ERR_HAS_PRODUCTS')
      categoryRepo.delete(id)
      return ok(null)
    } catch (e) { log.error('categories:delete', e); return err('Failed to delete category') }
  })
}
