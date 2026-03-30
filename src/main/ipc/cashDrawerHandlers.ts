import { ipcMain } from 'electron'
import { cashDrawerRepo, type CashDrawerEntryType } from '../database/repositories/cashDrawerRepo'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

const OUT_TYPES = new Set<CashDrawerEntryType>(['withdrawal', 'change_given', 'manual_out'])
const IN_TYPES = new Set<CashDrawerEntryType>(['manual_in'])

function validManualPair(direction: 'in' | 'out', entryType: CashDrawerEntryType): boolean {
  if (entryType === 'opening_balance' || entryType === 'sale_payment') return false
  if (direction === 'in') return IN_TYPES.has(entryType)
  return OUT_TYPES.has(entryType)
}

export function registerCashDrawerHandlers(): void {
  ipcMain.handle('cashDrawer:summary', (event, filters: { from?: string | null; to?: string | null } = {}) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const from = filters.from && filters.from.trim() !== '' ? filters.from : undefined
      const to = filters.to && filters.to.trim() !== '' ? filters.to : undefined
      return ok(cashDrawerRepo.summary({ from, to }))
    } catch (e) {
      log.error('cashDrawer:summary', e)
      return err('Failed to load cash drawer summary', 'ERR_CASH_DRAWER')
    }
  })

  ipcMain.handle('cashDrawer:list', (event, filters: { from?: string | null; to?: string | null; limit?: number } = {}) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const from = filters.from && filters.from.trim() !== '' ? filters.from : undefined
      const to = filters.to && filters.to.trim() !== '' ? filters.to : undefined
      return ok(cashDrawerRepo.list({ from, to, limit: filters.limit }))
    } catch (e) {
      log.error('cashDrawer:list', e)
      return err('Failed to list cash drawer transactions', 'ERR_CASH_DRAWER')
    }
  })

  ipcMain.handle('cashDrawer:setOpening', (event, payload: { businessDate: string; amount: number }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = payload.businessDate?.trim()
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return err('Invalid business date', 'ERR_VALIDATION')
      const amt = Number(payload.amount)
      if (Number.isNaN(amt) || amt < 0) return err('Amount must be zero or positive', 'ERR_VALIDATION')
      cashDrawerRepo.setOpeningBalance(d, amt)
      return ok(null)
    } catch (e: unknown) {
      log.error('cashDrawer:setOpening', e)
      const msg = e instanceof Error ? e.message : 'Failed to set opening balance'
      return err(msg, 'ERR_CASH_DRAWER')
    }
  })

  ipcMain.handle('cashDrawer:addManual', (event, payload: {
    direction: 'in' | 'out'
    amount: number
    entry_type: CashDrawerEntryType
    note?: string | null
    business_date?: string
  }) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.create')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!validManualPair(payload.direction, payload.entry_type)) {
        return err('Invalid entry type for direction', 'ERR_VALIDATION')
      }
      const id = cashDrawerRepo.addManual({
        direction: payload.direction,
        amount: payload.amount,
        entry_type: payload.entry_type,
        note: payload.note,
        business_date: payload.business_date,
      })
      return ok({ id })
    } catch (e: unknown) {
      log.error('cashDrawer:addManual', e)
      const msg = e instanceof Error ? e.message : 'Failed to record entry'
      return err(msg, 'ERR_CASH_DRAWER')
    }
  })
}
