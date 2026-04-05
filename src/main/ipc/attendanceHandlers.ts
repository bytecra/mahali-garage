import { ipcMain } from 'electron'
import {
  attendanceRepo,
  type CreateStatusInput,
} from '../database/repositories/attendanceRepo'
import { authService, type Session } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function canMarkAttendance(senderId: number, session: Session | undefined): boolean {
  if (!session) return false
  if (session.role === 'owner' || session.role === 'manager') return true
  return authService.hasPermission(senderId, 'employees.attendance')
}

function canManageStatusTypes(session: Session | undefined): boolean {
  if (!session) return false
  return session.role === 'owner' || session.role === 'manager'
}

export function registerAttendanceHandlers(): void {
  ipcMain.handle('attendance:getStatuses', event => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(attendanceRepo.getAttendanceStatuses())
    } catch (e) {
      log.error('attendance:getStatuses', e)
      return err('Failed to load attendance statuses')
    }
  })

  ipcMain.handle('attendance:createStatus', (event, data: unknown) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!canManageStatusTypes(session)) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = data as {
        name: string
        color: string
        emoji?: string
        is_paid: number
        counts_as_working: number
      }
      const created = attendanceRepo.createStatus({
        name: d.name,
        color: d.color,
        emoji: d.emoji,
        is_paid: d.is_paid,
        counts_as_working: d.counts_as_working,
        created_by: session!.userId,
      })
      return ok(created)
    } catch (e) {
      log.error('attendance:createStatus', e)
      return err(e instanceof Error ? e.message : 'Failed to create status')
    }
  })

  ipcMain.handle('attendance:updateStatus', (event, id: number, data: unknown) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!canManageStatusTypes(session)) return err('Forbidden', 'ERR_FORBIDDEN')
      attendanceRepo.updateStatus(id, data as Partial<CreateStatusInput>)
      return ok(true)
    } catch (e) {
      log.error('attendance:updateStatus', e)
      return err(e instanceof Error ? e.message : 'Failed to update status')
    }
  })

  ipcMain.handle('attendance:deleteStatus', (event, id: number) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!canManageStatusTypes(session)) return err('Forbidden', 'ERR_FORBIDDEN')
      attendanceRepo.deleteStatus(id)
      return ok(true)
    } catch (e) {
      log.error('attendance:deleteStatus', e)
      return err(e instanceof Error ? e.message : 'Failed to delete status')
    }
  })

  ipcMain.handle('attendance:mark', (event, data: unknown) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!canMarkAttendance(event.sender.id, session)) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = data as {
        employee_id: number
        date: string
        status_type_id: number
        department?: string
        notes?: string
      }
      attendanceRepo.markAttendance({
        employee_id: d.employee_id,
        date: d.date,
        status_type_id: d.status_type_id,
        department: d.department,
        notes: d.notes,
        marked_by: session!.userId,
      })
      return ok(true)
    } catch (e) {
      log.error('attendance:mark', e)
      return err('Failed to mark attendance')
    }
  })

  ipcMain.handle('attendance:bulkMark', (event, data: unknown) => {
    try {
      const session = authService.getSession(event.sender.id)
      if (!canMarkAttendance(event.sender.id, session)) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = data as {
        employee_ids: number[]
        dates: string[]
        status_type_id: number
        department?: string
        notes?: string
        overwrite?: boolean
      }
      const result = attendanceRepo.bulkMarkAttendance({
        employee_ids: d.employee_ids,
        dates: d.dates,
        status_type_id: d.status_type_id,
        department: d.department,
        notes: d.notes,
        marked_by: session!.userId,
        overwrite: d.overwrite,
      })
      return ok(result)
    } catch (e) {
      log.error('attendance:bulkMark', e)
      return err('Failed to bulk mark attendance')
    }
  })

  ipcMain.handle(
    'attendance:getMonthly',
    (event, employeeId: number, year: number, month: number) => {
      try {
        const session = authService.getSession(event.sender.id)
        if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
        return ok(attendanceRepo.getAttendance(employeeId, year, month))
      } catch (e) {
        log.error('attendance:getMonthly', e)
        return err('Failed to load attendance')
      }
    }
  )

  ipcMain.handle(
    'attendance:getSummary',
    (event, employeeId: number, year: number, month: number) => {
      try {
        const session = authService.getSession(event.sender.id)
        if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
        return ok(attendanceRepo.getAttendanceSummary(employeeId, year, month))
      } catch (e) {
        log.error('attendance:getSummary', e)
        return err('Failed to load attendance summary')
      }
    }
  )

  ipcMain.handle(
    'attendance:getReport',
    (event, employeeId: number, fromDate: string, toDate: string) => {
      try {
        const session = authService.getSession(event.sender.id)
        if (!session) return err('Forbidden', 'ERR_FORBIDDEN')
        return ok(attendanceRepo.getMonthlyAttendanceReport(employeeId, fromDate, toDate))
      } catch (e) {
        log.error('attendance:getReport', e)
        return err('Failed to load attendance report')
      }
    }
  )
}
