import { ipcMain } from 'electron'
import { appointmentRepo, type AppointmentCreateInput, type AppointmentListParams } from '../database/repositories/appointmentRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerAppointmentHandlers(): void {
  ipcMain.handle('appointments:list', (event, params: AppointmentListParams) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!params?.from || !params?.to) return err('Invalid params', 'ERR_VALIDATION')
      return ok(appointmentRepo.list(params))
    } catch (e) {
      log.error('appointments:list', e)
      return err('Failed')
    }
  })

  ipcMain.handle('appointments:create', (event, data: AppointmentCreateInput) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      const payload: AppointmentCreateInput = {
        ...data,
        created_by: session.userId,
      }
      return ok(appointmentRepo.create(payload))
    } catch (e) {
      log.error('appointments:create', e)
      return err('Failed')
    }
  })

  ipcMain.handle('appointments:getById', (event, id: number) => {
    try {
      if (!authService.getSession(event.sender.id)) return err('Forbidden', 'ERR_FORBIDDEN')
      const row = appointmentRepo.getById(id)
      return row ? ok(row) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) {
      log.error('appointments:getById', e)
      return err('Failed')
    }
  })

  ipcMain.handle('appointments:updateStatus', (event, id: number, status: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      appointmentRepo.updateStatus(id, status, session.userId)
      return ok(null)
    } catch (e) {
      log.error('appointments:updateStatus', e)
      return err('Failed')
    }
  })

  ipcMain.handle('appointments:convertToJobCard', (event, id: number, jobCardId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'job_cards.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      appointmentRepo.convertToJobCard(id, jobCardId)
      return ok(null)
    } catch (e) {
      log.error('appointments:convertToJobCard', e)
      return err('Failed')
    }
  })

  ipcMain.handle('appointments:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      appointmentRepo.delete(id)
      return ok(null)
    } catch (e) {
      log.error('appointments:delete', e)
      return err('Failed')
    }
  })
}
