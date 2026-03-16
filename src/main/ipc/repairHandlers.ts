import { ipcMain } from 'electron'
import { repairRepo } from '../database/repositories/repairRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
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

export function registerRepairHandlers(): void {
  ipcMain.handle('repairs:list', (event, filters) => {
    try {
      const licErr = requireLicense('repairs.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(repairRepo.list(filters))
    } catch (e) { log.error('repairs:list', e); return err('Failed', 'ERR_REPAIRS') }
  })

  ipcMain.handle('repairs:getByStatus', (event) => {
    try {
      const licErr = requireLicense('repairs.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(repairRepo.getByStatus())
    } catch (e) { log.error('repairs:getByStatus', e); return err('Failed', 'ERR_REPAIRS') }
  })

  ipcMain.handle('repairs:getById', (event, id: number) => {
    try {
      const licErr = requireLicense('repairs.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const r = repairRepo.getById(id)
      if (!r) return err('Not found', 'ERR_NOT_FOUND')
      return ok(r)
    } catch (e) { log.error('repairs:getById', e); return err('Failed', 'ERR_REPAIRS') }
  })

  ipcMain.handle('repairs:create', (event, input) => {
    try {
      const licErr = requireLicense('repairs.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = repairRepo.create({ ...input, created_by: session!.userId }) as { id: number; job_number: string }
      try {
        activityLogRepo.log({
          userId: session!.userId,
          action: 'repair.create',
          entity: 'repair',
          entityId: result.id,
          details: JSON.stringify({ job: result.job_number, type: input.type }),
        })
      } catch { /* non-critical */ }
      return ok(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create repair'
      return err(msg, 'ERR_REPAIRS')
    }
  })

  ipcMain.handle('repairs:update', (event, id: number, input) => {
    try {
      const licErr = requireLicense('repairs.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(repairRepo.update(id, input))
    } catch (e) { log.error('repairs:update', e); return err('Failed', 'ERR_REPAIRS') }
  })

  ipcMain.handle('repairs:updateStatus', (event, id: number, status: string, notes?: string) => {
    try {
      const licErr = requireLicense('repairs.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.updateStatus')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = repairRepo.updateStatus(id, status, session!.userId, notes)
      try {
        activityLogRepo.log({
          userId: session!.userId,
          action: 'repair.status_change',
          entity: 'repair',
          entityId: id,
          details: JSON.stringify({ status, notes }),
        })
      } catch { /* non-critical */ }
      return ok(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update status'
      return err(msg, 'ERR_REPAIRS')
    }
  })

  ipcMain.handle('repairs:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('repairs.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(repairRepo.delete(id))
    } catch (e) { log.error('repairs:delete', e); return err('Failed', 'ERR_REPAIRS') }
  })
}
