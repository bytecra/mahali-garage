import { ipcMain, dialog, shell } from 'electron'
import { expenseRepo } from '../database/repositories/expenseRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerExpenseHandlers(): void {
  // ── Categories ──────────────────────────────────────────────────────────
  ipcMain.handle('expenseCategories:list', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.listCategories())
    } catch (e) { log.error('expenseCategories:list', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok({ id: expenseRepo.createCategory(data) })
    } catch (e) { log.error('expenseCategories:create', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.updateCategory(id, data); return ok(null)
    } catch (e) { log.error('expenseCategories:update', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.deleteCategory(id); return ok(null)
    } catch (e) { log.error('expenseCategories:delete', e); return err('Failed') }
  })

  // ── Expenses ─────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.list(filters))
    } catch (e) { log.error('expenses:list', e); return err('Failed') }
  })

  ipcMain.handle('expenses:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const row = expenseRepo.getById(id)
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      return ok(row)
    } catch (e) { log.error('expenses:getById', e); return err('Failed') }
  })

  ipcMain.handle('expenses:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = expenseRepo.create({ ...data, user_id: session!.userId })
      return ok({ id })
    } catch (e) { log.error('expenses:create', e); return err('Failed') }
  })

  ipcMain.handle('expenses:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.update(id, data); return ok(null)
    } catch (e) { log.error('expenses:update', e); return err('Failed') }
  })

  ipcMain.handle('expenses:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.delete(id); return ok(null)
    } catch (e) { log.error('expenses:delete', e); return err('Failed') }
  })

  ipcMain.handle('expenses:selectReceipt', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Receipt / Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return ok(null)
      return ok(result.filePaths[0])
    } catch (e) { log.error('expenses:selectReceipt', e); return err('Failed') }
  })

  ipcMain.handle('expenses:openReceipt', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath); return ok(null)
    } catch (e) { log.error('expenses:openReceipt', e); return err('Failed') }
  })

  // ── Report queries ────────────────────────────────────────────────────────
  ipcMain.handle('expenses:sumByCategory', (event, from: string, to: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.sumByCategory(from, to))
    } catch (e) { log.error('expenses:sumByCategory', e); return err('Failed') }
  })

  ipcMain.handle('expenses:sumByMonth', (event, year: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.sumByMonth(year))
    } catch (e) { log.error('expenses:sumByMonth', e); return err('Failed') }
  })
}
