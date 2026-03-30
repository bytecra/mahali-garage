import { ipcMain } from 'electron'
import { carBrandRepo } from '../database/repositories/carBrandRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerCarBrandHandlers(): void {
  ipcMain.handle('carBrands:list', (event) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(carBrandRepo.list())
    } catch (e) { log.error('carBrands:list', e); return err('Failed', 'ERR_CAR_BRANDS') }
  })

  ipcMain.handle('carBrands:create', (event, input: { name: string; logo?: string | null }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!input?.name?.trim()) return err('Name required', 'ERR_VALIDATION')
      const id = carBrandRepo.create({ name: input.name, logo: input.logo ?? null })
      return ok({ id })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      log.error('carBrands:create', e)
      return err(msg, 'ERR_CAR_BRANDS')
    }
  })

  ipcMain.handle('carBrands:update', (event, id: number, input: { name?: string; logo?: string | null }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      carBrandRepo.update(id, input)
      return ok(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      log.error('carBrands:update', e)
      return err(msg, 'ERR_CAR_BRANDS')
    }
  })

  ipcMain.handle('carBrands:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      carBrandRepo.delete(id)
      return ok(null)
    } catch (e) { log.error('carBrands:delete', e); return err('Failed', 'ERR_CAR_BRANDS') }
  })
}
