import { ipcMain } from 'electron'
import { jobTypeRepo } from '../database/repositories/jobTypeRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerJobTypeHandlers(): void {
  ipcMain.handle('jobTypes:listAll', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobTypeRepo.listAll())
    } catch (e) { log.error('jobTypes:listAll', e); return err('Failed', 'ERR_JOB_TYPES') }
  })

  ipcMain.handle('jobTypes:listActive', () => {
    try {
      return ok(jobTypeRepo.listActive())
    } catch (e) { log.error('jobTypes:listActive', e); return err('Failed', 'ERR_JOB_TYPES') }
  })

  ipcMain.handle('jobTypes:create', (event, data: { name: string; description?: string; is_active?: boolean }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (session?.role !== 'owner') return err('Only the owner can manage job types', 'ERR_FORBIDDEN')
      const id = jobTypeRepo.create(data)
      return ok({ id })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('UNIQUE')) return err('A job type with that name already exists', 'ERR_DUPLICATE')
      log.error('jobTypes:create', e); return err(msg, 'ERR_JOB_TYPES')
    }
  })

  ipcMain.handle('jobTypes:update', (event, id: number, data: { name?: string; description?: string; is_active?: boolean }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (session?.role !== 'owner') return err('Only the owner can manage job types', 'ERR_FORBIDDEN')
      return ok(jobTypeRepo.update(id, data))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('UNIQUE')) return err('A job type with that name already exists', 'ERR_DUPLICATE')
      log.error('jobTypes:update', e); return err(msg, 'ERR_JOB_TYPES')
    }
  })

  ipcMain.handle('jobTypes:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (session?.role !== 'owner') return err('Only the owner can manage job types', 'ERR_FORBIDDEN')
      const result = jobTypeRepo.delete(id)
      if (!result.success) return err(result.error!, 'ERR_IN_USE')
      return ok(true)
    } catch (e) { log.error('jobTypes:delete', e); return err('Failed', 'ERR_JOB_TYPES') }
  })

  ipcMain.handle('jobTypes:reorder', (event, id: number, direction: 'up' | 'down') => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (session?.role !== 'owner') return err('Only the owner can manage job types', 'ERR_FORBIDDEN')
      return ok(jobTypeRepo.reorder(id, direction))
    } catch (e) { log.error('jobTypes:reorder', e); return err('Failed', 'ERR_JOB_TYPES') }
  })
}
