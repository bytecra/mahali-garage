import { ipcMain } from 'electron'
import { vehicleRepo } from '../database/repositories/vehicleRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerVehicleHandlers(): void {
  ipcMain.handle('vehicles:list', (event, filters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(vehicleRepo.list(filters))
    } catch (e) { log.error('vehicles:list', e); return err('Failed', 'ERR_VEHICLES') }
  })

  ipcMain.handle('vehicles:getById', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const v = vehicleRepo.getById(id)
      if (!v) return err('Not found', 'ERR_NOT_FOUND')
      return ok(v)
    } catch (e) { log.error('vehicles:getById', e); return err('Failed', 'ERR_VEHICLES') }
  })

  ipcMain.handle('vehicles:create', (event, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const id = vehicleRepo.create(data)
      return ok({ id })
    } catch (e) { log.error('vehicles:create', e); return err('Failed', 'ERR_VEHICLES') }
  })

  ipcMain.handle('vehicles:update', (event, id: number, data) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(vehicleRepo.update(id, data))
    } catch (e) { log.error('vehicles:update', e); return err('Failed', 'ERR_VEHICLES') }
  })

  ipcMain.handle('vehicles:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(vehicleRepo.delete(id))
    } catch (e) { log.error('vehicles:delete', e); return err('Failed', 'ERR_VEHICLES') }
  })

  ipcMain.handle('vehicles:getByOwner', (event, ownerId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'customers.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(vehicleRepo.getByOwner(ownerId))
    } catch (e) { log.error('vehicles:getByOwner', e); return err('Failed', 'ERR_VEHICLES') }
  })
}
