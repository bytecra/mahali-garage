import { ipcMain } from 'electron'
import { reportRepo, type ReportDepartmentFilter } from '../database/repositories/reportRepo'
import { assetRepo } from '../database/repositories/assetRepo'
import { salaryRepo } from '../database/repositories/salaryRepo'
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

export function registerReportHandlers(): void {
  ipcMain.handle('reports:dashboard', (event) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.dashboard())
    } catch (e) { log.error('reports:dashboard', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:employeesAvailability', (event) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.employeesAvailableToday())
    } catch (e) {
      log.error('reports:employeesAvailability', e)
      return err('Failed')
    }
  })

  ipcMain.handle('reports:salaryReport', (event, params: unknown) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.financial')) return err('Forbidden', 'ERR_FORBIDDEN')

      const p = params as {
        type?: string
        employeeId?: number
        fromDate?: string
        toDate?: string
        department?: string
      }

      if (p.type === 'single') {
        if (p.employeeId == null || !p.fromDate || !p.toDate) return err('Invalid params', 'ERR_VALIDATION')
        return ok(salaryRepo.getSalaryReportForEmployee(Number(p.employeeId), p.fromDate, p.toDate))
      }
      if (!p.fromDate || !p.toDate) return err('Invalid params', 'ERR_VALIDATION')
      return ok(salaryRepo.getSalaryReportAllEmployees(p.fromDate, p.toDate, p.department))
    } catch (e) {
      log.error('reports:salaryReport', e)
      return err('Failed')
    }
  })

  ipcMain.handle('reports:salesDaily', (event, dateFrom: string, dateTo?: string, department?: ReportDepartmentFilter) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const to = dateTo && dateTo.length ? dateTo : dateFrom
      const dept = department ?? 'all'
      return ok(reportRepo.salesDaily(dateFrom, to, dept))
    } catch (e) { log.error('reports:salesDaily', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:salesMonthly', (event, year: number, month: number) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.salesMonthly(year, month))
    } catch (e) { log.error('reports:salesMonthly', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:profit', (event, dateFrom: string, dateTo: string, department?: ReportDepartmentFilter) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.profit(dateFrom, dateTo, department ?? 'all'))
    } catch (e) { log.error('reports:profit', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:departmentSummary', (event, dateFrom: string, dateTo: string) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.departmentSummary(dateFrom, dateTo))
    } catch (e) { log.error('reports:departmentSummary', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:cashByMethod', (event, dateFrom: string, dateTo?: string) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      const to = dateTo && dateTo.length ? dateTo : dateFrom
      return ok(reportRepo.cashByMethodRange(dateFrom, to))
    } catch (e) { log.error('reports:cashByMethod', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:inventory', (event) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.inventory())
    } catch (e) { log.error('reports:inventory', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:lowStock', (event) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.lowStock())
    } catch (e) { log.error('reports:lowStock', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:topProducts', (event, dateFrom: string, dateTo: string) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.topProducts(dateFrom, dateTo))
    } catch (e) { log.error('reports:topProducts', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:customerDebts', (event, department?: ReportDepartmentFilter) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reportRepo.customerDebts(department ?? 'all'))
    } catch (e) { log.error('reports:customerDebts', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:assets', (event) => {
    try {
      const licErr = requireLicense('reports.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'reports.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const { rows } = assetRepo.list({ limit: 10000 })
      const totals = assetRepo.reportTotals()
      return ok({ rows, total_purchase: totals.total_purchase, total_current: totals.total_current })
    } catch (e) { log.error('reports:assets', e); return err('Failed', 'ERR_REPORTS') }
  })

  ipcMain.handle('reports:employeePerformance', (event, params: unknown) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'reports.employee'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const p = params as {
        employeeId?: number
        fromDate: string
        toDate: string
        department?: string
      }
      if (!p?.fromDate || !p?.toDate) return err('Invalid params', 'ERR_VALIDATION')
      return ok(reportRepo.getEmployeePerformance(p))
    } catch (e) {
      log.error('reports:employeePerformance', e)
      return err('Failed')
    }
  })
}
