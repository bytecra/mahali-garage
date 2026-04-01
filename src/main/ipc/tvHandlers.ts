import { ipcMain } from 'electron'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'
import { openTvWindow } from '../services/tvWindow'

export function registerTvHandlers(): void {
  ipcMain.handle('tv:open', () => {
    try {
      openTvWindow()
      return ok({ success: true })
    } catch (e) {
      log.error('tv:open', e)
      return err('Failed to open TV display')
    }
  })
}

