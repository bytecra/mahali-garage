import { ipcMain } from 'electron'
import { serviceCatalogRepo, type ServiceCatalogFilters, type ServiceCatalogInput } from '../database/repositories/serviceCatalogRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerServiceCatalogHandlers(): void {
  ipcMain.handle('serviceCatalog:list', (event, filters?: ServiceCatalogFilters) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(serviceCatalogRepo.list(filters ?? {}))
    } catch (e) { log.error('serviceCatalog:list', e); return err('Failed', 'ERR_SERVICE_CATALOG') }
  })

  ipcMain.handle('serviceCatalog:search', (event, query: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(serviceCatalogRepo.search(typeof query === 'string' ? query : ''))
    } catch (e) { log.error('serviceCatalog:search', e); return err('Failed', 'ERR_SERVICE_CATALOG') }
  })

  ipcMain.handle('serviceCatalog:forVehicle', (event, make: string, model: string) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(serviceCatalogRepo.forVehicleMakeModel(make ?? '', model ?? ''))
    } catch (e) { log.error('serviceCatalog:forVehicle', e); return err('Failed', 'ERR_SERVICE_CATALOG') }
  })

  ipcMain.handle('serviceCatalog:create', (event, input: ServiceCatalogInput) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = serviceCatalogRepo.create({
        ...input,
        created_by: session?.userId ?? null,
      })
      return ok({ id })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      log.error('serviceCatalog:create', e)
      if (msg === 'SERVICE_NAME_DUPLICATE') {
        return err('Service name already exists for this department. Choose a different name.', 'ERR_SERVICE_CATALOG')
      }
      return err(msg, 'ERR_SERVICE_CATALOG')
    }
  })

  ipcMain.handle('serviceCatalog:update', (event, id: number, input: Partial<ServiceCatalogInput>) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      serviceCatalogRepo.update(id, input)
      return ok(null)
    } catch (e) { log.error('serviceCatalog:update', e); return err('Failed', 'ERR_SERVICE_CATALOG') }
  })

  ipcMain.handle('serviceCatalog:delete', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'settings.manage')) return err('Forbidden', 'ERR_FORBIDDEN')
      serviceCatalogRepo.softDelete(id)
      return ok(null)
    } catch (e) { log.error('serviceCatalog:delete', e); return err('Failed', 'ERR_SERVICE_CATALOG') }
  })
}
