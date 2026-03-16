import { ipcMain } from 'electron'
import { reportRepo } from '../database/repositories/reportRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerReportHandlers(): void {
  ipcMain.handle('reports:dashboard', (event) => {
    try {
      // Dashboard is accessible to all authenticated users
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.dashboard())
    } catch (e) { log.error('reports:dashboard', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:salesDaily', (event, date: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.salesDaily(date))
    } catch (e) { log.error('reports:salesDaily', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:salesMonthly', (event, year: number, month: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.salesMonthly(year, month))
    } catch (e) { log.error('reports:salesMonthly', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:profit', (event, dateFrom: string, dateTo: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.profit(dateFrom, dateTo))
    } catch (e) { log.error('reports:profit', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:inventory', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.inventory())
    } catch (e) { log.error('reports:inventory', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:lowStock', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.lowStock())
    } catch (e) { log.error('reports:lowStock', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:topProducts', (event, dateFrom: string, dateTo: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.topProducts(dateFrom, dateTo))
    } catch (e) { log.error('reports:topProducts', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:customerDebts', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.customerDebts())
    } catch (e) { log.error('reports:customerDebts', e); return err('Failed', 'ERR_REPORTS') }
  })
}
