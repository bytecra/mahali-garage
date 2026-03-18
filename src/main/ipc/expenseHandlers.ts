import { ipcMain, dialog, shell } from 'electron'
import { expenseRepo } from '../database/repositories/expenseRepo'
import { authService } from '../services/authService'
import { hasFeature } from '../licensing/license-manager'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function requireLicense(feature: string): string | null {
  try {
    if (!hasFeature(feature)) return 'This feature requires STANDARD or PREMIUM license'
  } catch (e) {
    log.error('License check error', e)
    return null
  }
  return null
}

export function registerExpenseHandlers(): void {
  // ── Categories ──────────────────────────────────────────────────────────
  ipcMain.handle('expenseCategories:list', (event) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.listCategories())
    } catch (e) { log.error('expenseCategories:list', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:create', (event, data) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok({ id: expenseRepo.createCategory(data) })
    } catch (e) { log.error('expenseCategories:create', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:update', (event, id: number, data) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.updateCategory(id, data); return ok(null)
    } catch (e) { log.error('expenseCategories:update', e); return err('Failed') }
  })

  ipcMain.handle('expenseCategories:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.manage_categories')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.deleteCategory(id); return ok(null)
    } catch (e) { log.error('expenseCategories:delete', e); return err('Failed') }
  })

  // ── Expenses ─────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:list', (event, filters) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.list(filters))
    } catch (e) { log.error('expenses:list', e); return err('Failed') }
  })

  ipcMain.handle('expenses:getById', (event, id: number) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const row = expenseRepo.getById(id)
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      return ok(row)
    } catch (e) { log.error('expenses:getById', e); return err('Failed') }
  })

  ipcMain.handle('expenses:create', (event, data) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = expenseRepo.create({ ...data, user_id: session!.userId })
      return ok({ id })
    } catch (e) { log.error('expenses:create', e); return err('Failed') }
  })

  ipcMain.handle('expenses:update', (event, id: number, data) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.update(id, data); return ok(null)
    } catch (e) { log.error('expenses:update', e); return err('Failed') }
  })

  ipcMain.handle('expenses:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
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

  ipcMain.handle('expenses:upcomingDue', (event, days?: number) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.getUpcomingDue(days ?? 7))
    } catch (e) { log.error('expenses:upcomingDue', e); return err('Failed') }
  })

  ipcMain.handle('expenses:markPaid', (event, id: number) => {
    try {
      const licErr = requireLicense('expenses.add')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.add')) return err('Forbidden', 'ERR_FORBIDDEN')
      expenseRepo.markPaid(id); return ok(null)
    } catch (e) { log.error('expenses:markPaid', e); return err('Failed') }
  })

  // ── Report queries ────────────────────────────────────────────────────────
  ipcMain.handle('expenses:sumByCategory', (event, from: string, to: string) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.sumByCategory(from, to))
    } catch (e) { log.error('expenses:sumByCategory', e); return err('Failed') }
  })

  ipcMain.handle('expenses:sumByMonth', (event, year: number) => {
    try {
      const licErr = requireLicense('expenses.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'expenses.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(expenseRepo.sumByMonth(year))
    } catch (e) { log.error('expenses:sumByMonth', e); return err('Failed') }
  })
}
