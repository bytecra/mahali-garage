import { ipcMain, screen } from 'electron'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'
import { openTvWindow } from '../services/tvWindow'
import { authService } from '../services/authService'

export function registerTvHandlers(): void {
  ipcMain.handle('tv:listDisplays', () => {
    try {
      const displays = screen.getAllDisplays()
      const primaryId = screen.getPrimaryDisplay().id
      const rows = displays.map((d, idx) => ({
        index: idx,
        id: d.id,
        label: `Display ${idx + 1}${d.id === primaryId ? ' (Primary)' : ''} (${d.size.width}x${d.size.height})`,
        bounds: d.bounds,
      }))
      return ok(rows)
    } catch (e) {
      log.error('tv:listDisplays', e)
      return err('Failed to list displays')
    }
  })

  ipcMain.handle('tv:open', (event) => {
    try {
      const openerSession = authService.getSession(event.sender.id)
      if (!openerSession) return err('Forbidden', 'ERR_FORBIDDEN')

      const win = openTvWindow()
      authService.cloneSession(event.sender.id, win.webContents.id)
      return ok({ success: true })
    } catch (e) {
      log.error('tv:open', e)
      return err('Failed to open TV display')
    }
  })
}

