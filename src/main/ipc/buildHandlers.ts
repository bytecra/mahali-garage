import { ipcMain } from 'electron'
import { buildRepo } from '../database/repositories/buildRepo'
import type { BuildFilters } from '../database/repositories/buildRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerBuildHandlers(): void {
  ipcMain.handle('builds:list', (event, filters: BuildFilters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(buildRepo.list(filters))
    } catch (e) { log.error('builds:list', e); return err('Failed') }
  })

  ipcMain.handle('builds:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const build = buildRepo.getById(id)
      return build ? ok(build) : err('Not found', 'ERR_NOT_FOUND')
    } catch (e) { log.error('builds:getById', e); return err('Failed') }
  })

  ipcMain.handle('builds:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = buildRepo.create({ ...data, created_by: session?.userId ?? null })
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'build.create',
          entity: 'build',
          entityId: id,
          details: JSON.stringify({ name: data.name }),
        })
      } catch { /* non-critical */ }
      return ok(id)
    } catch (e) {
      log.error('builds:create', e)
      const msg = e instanceof Error ? e.message : 'Failed to create build'
      return err(msg)
    }
  })

  ipcMain.handle('builds:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      buildRepo.update(id, data)
      return ok(true)
    } catch (e) { log.error('builds:update', e); return err('Failed') }
  })

  ipcMain.handle('builds:reserve', (event, buildId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      buildRepo.reserve(buildId, session?.userId ?? 0)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'build.reserve',
          entity: 'build',
          entityId: buildId,
        })
      } catch { /* non-critical */ }
      return ok(true)
    } catch (e) {
      log.error('builds:reserve', e)
      const msg = e instanceof Error ? e.message : 'Failed to reserve build'
      return err(msg)
    }
  })

  ipcMain.handle('builds:completeAssembly', (event, buildId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      buildRepo.completeAssembly(buildId, session?.userId ?? 0)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'build.complete',
          entity: 'build',
          entityId: buildId,
        })
      } catch { /* non-critical */ }
      return ok(true)
    } catch (e) {
      log.error('builds:completeAssembly', e)
      const msg = e instanceof Error ? e.message : 'Failed to complete assembly'
      return err(msg)
    }
  })

  ipcMain.handle('builds:cancel', (event, buildId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      buildRepo.cancel(buildId)
      try {
        activityLogRepo.log({
          userId: session?.userId ?? 0,
          action: 'build.cancel',
          entity: 'build',
          entityId: buildId,
        })
      } catch { /* non-critical */ }
      return ok(true)
    } catch (e) { log.error('builds:cancel', e); return err('Failed') }
  })

  ipcMain.handle('builds:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      buildRepo.delete(id)
      return ok(true)
    } catch (e) { log.error('builds:delete', e); return err('Failed') }
  })
}
