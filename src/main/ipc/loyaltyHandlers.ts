import { ipcMain } from 'electron'
import { authService } from '../services/authService'
import { loyaltyRepo } from '../database/repositories/loyaltyRepo'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

export function registerLoyaltyHandlers(): void {

  ipcMain.handle('loyalty:get',
    (event, customerId: number,
     department?: string) => {
      try {
        if (!authService.getSession(event.sender.id))
          return err('Forbidden', 'ERR_FORBIDDEN')
        const dept = (department || 'all') as
          'all' | 'mechanical' | 'programming'
        return ok(loyaltyRepo.getLoyalty(
          customerId, dept))
      } catch (e) {
        log.error('loyalty:get', e)
        return err('Failed')
      }
    })

  ipcMain.handle('loyalty:getAllDepts',
    (event, customerId: number) => {
      try {
        if (!authService.getSession(event.sender.id))
          return err('Forbidden', 'ERR_FORBIDDEN')
        return ok(loyaltyRepo.getAllDepts(customerId))
      } catch (e) {
        log.error('loyalty:getAllDepts', e)
        return err('Failed')
      }
    })

  ipcMain.handle('loyalty:addTransaction',
    (event, data: {
      customer_id: number
      department?: 'all' | 'mechanical' | 'programming'
      type: 'earn_points' | 'earn_stamps' | 'redeem' | 'manual_adjust'
      points_delta: number
      stamps_delta: number
      visits_delta: number
      source?: 'invoice' | 'receipt' | 'manual'
      source_id?: number
      note?: string
      created_by?: number
    }) => {
      try {
        if (!authService.hasPermission(
          event.sender.id, 'sales.create'))
          return err('Forbidden', 'ERR_FORBIDDEN')
        loyaltyRepo.addTransaction({
          ...data,
          department: data.department ?? 'all',
        })
        return ok(null)
      } catch (e) {
        log.error('loyalty:addTransaction', e)
        return err('Failed')
      }
    })

  ipcMain.handle('loyalty:getTransactions',
    (event, customerId: number,
     departmentOrLimit?: string | number, limit?: number) => {
      try {
        if (!authService.getSession(event.sender.id))
          return err('Forbidden', 'ERR_FORBIDDEN')
        let department: string | undefined
        let lim = 20
        if (typeof departmentOrLimit === 'number' && limit === undefined) {
          lim = departmentOrLimit > 0 ? departmentOrLimit : 20
        } else {
          department = typeof departmentOrLimit === 'string' ? departmentOrLimit : undefined
          lim = typeof limit === 'number' && limit > 0 ? limit : 20
        }
        return ok(loyaltyRepo.getTransactions(
          customerId, department, lim))
      } catch (e) {
        log.error('loyalty:getTransactions', e)
        return err('Failed')
      }
    })

  ipcMain.handle('loyalty:processAutoEarn',
    (event, params) => {
      try {
        if (!authService.getSession(event.sender.id))
          return err('Forbidden', 'ERR_FORBIDDEN')
        loyaltyRepo.processAutoEarn(params)
        return ok(null)
      } catch (e) {
        log.error('loyalty:processAutoEarn', e)
        return err('Failed')
      }
    })

  ipcMain.handle('loyalty:redeemReward',
    (event, params) => {
      try {
        if (!authService.hasPermission(
          event.sender.id, 'sales.create'))
          return err('Forbidden', 'ERR_FORBIDDEN')
        loyaltyRepo.redeemReward(params)
        return ok(null)
      } catch (e) {
        log.error('loyalty:redeemReward', e)
        return err('Failed')
      }
    })
}
