import { ipcMain } from 'electron'
import { jobCardRepo } from '../database/repositories/jobCardRepo'
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

export function registerJobCardHandlers(): void {
  ipcMain.handle('jobCards:list', (event, filters) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.list(filters))
    } catch (e) { log.error('jobCards:list', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getByStatus', (event) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.getByStatus())
    } catch (e) { log.error('jobCards:getByStatus', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getById', (event, id: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const card = jobCardRepo.getById(id)
      if (!card) return err('Not found', 'ERR_NOT_FOUND')
      return ok(card)
    } catch (e) { log.error('jobCards:getById', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:create', (event, input) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = jobCardRepo.create({ ...input, created_by: session!.userId })
      try {
        activityLogRepo.log({
          userId: session!.userId,
          action: 'job_card.create',
          entity: 'job_card',
          entityId: result.id,
          details: JSON.stringify({ job: result.job_number }),
        })
      } catch { /* non-critical */ }
      return ok(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create job card'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:update', (event, id: number, input) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.update(id, input))
    } catch (e) { log.error('jobCards:update', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:updateStatus', (event, id: number, status: string) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.updateStatus')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.updateStatus(id, status))
    } catch (e) { log.error('jobCards:updateStatus', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.delete(id))
    } catch (e) { log.error('jobCards:delete', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:addPart', (event, jobCardId: number, part) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const id = jobCardRepo.addPart(jobCardId, part)
      return ok({ id })
    } catch (e) { log.error('jobCards:addPart', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:removePart', (event, partId: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.removePart(partId))
    } catch (e) { log.error('jobCards:removePart', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getForVehicle', (event, vehicleId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.getForVehicle(vehicleId))
    } catch (e) { log.error('jobCards:getForVehicle', e); return err('Failed', 'ERR_JOB_CARDS') }
  })
}
