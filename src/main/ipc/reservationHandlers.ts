import { ipcMain } from 'electron'
import { reservationRepo } from '../database/repositories/reservationRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerReservationHandlers(): void {
  ipcMain.handle('reservations:listByJob', (event, jobCardId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reservationRepo.listByJob(jobCardId))
    } catch (e) { log.error('reservations:listByJob', e); return err('Failed') }
  })

  ipcMain.handle('reservations:listByProduct', (event, productId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'inventory.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reservationRepo.listByProduct(productId))
    } catch (e) { log.error('reservations:listByProduct', e); return err('Failed') }
  })

  ipcMain.handle('reservations:reservedQuantity', (event, productId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'inventory.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(reservationRepo.reservedQuantity(productId))
    } catch (e) { log.error('reservations:reservedQuantity', e); return err('Failed') }
  })

  ipcMain.handle('reservations:create', (event, data: {
    job_card_id: number
    product_id: number
    quantity: number
    notes?: string | null
  }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = reservationRepo.create({ ...data, reserved_by: session?.userId ?? null })
      return ok(id)
    } catch (e) {
      log.error('reservations:create', e)
      const msg = e instanceof Error ? e.message : 'Failed to create reservation'
      return err(msg)
    }
  })

  ipcMain.handle('reservations:consume', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      reservationRepo.consume(id)
      return ok(true)
    } catch (e) { log.error('reservations:consume', e); return err('Failed') }
  })

  ipcMain.handle('reservations:release', (event, id: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      reservationRepo.release(id)
      return ok(true)
    } catch (e) { log.error('reservations:release', e); return err('Failed') }
  })

  ipcMain.handle('reservations:releaseAllForJob', (event, jobCardId: number) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'repairs.edit'))
        return err('Forbidden', 'ERR_FORBIDDEN')
      reservationRepo.releaseAllForJob(jobCardId)
      return ok(true)
    } catch (e) { log.error('reservations:releaseAllForJob', e); return err('Failed') }
  })
}
