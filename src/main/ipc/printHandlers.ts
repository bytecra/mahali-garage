import { BrowserWindow, app, ipcMain } from 'electron'
import { unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function createPrintWindow(parent: BrowserWindow | null): BrowserWindow {
  return new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    parent: parent ?? undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
}

export function registerPrintHandlers(): void {
  ipcMain.handle('print:receipt', async (event, html: unknown) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) {
        return err('Forbidden', 'ERR_FORBIDDEN')
      }
      if (typeof html !== 'string' || html.trim() === '') {
        return err('Invalid print payload', 'ERR_VALIDATION')
      }

      const parent = BrowserWindow.fromWebContents(event.sender) ?? null
      const win = createPrintWindow(parent)

      // Block any popup windows opened by the print window (prevents about: URL dialogs on Windows)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      const tempPath = path.join(app.getPath('temp'), `mahali-receipt-${Date.now()}.html`)
      writeFileSync(tempPath, html, 'utf-8')

      const result = await new Promise<boolean>((resolve) => {
        let settled = false
        const finalize = (printed: boolean): void => {
          if (settled) return
          settled = true
          try { unlinkSync(tempPath) } catch { /* ignore cleanup failures */ }
          try { if (!win.isDestroyed()) win.close() } catch { /* ignore */ }
          resolve(printed)
        }

        const timeout = setTimeout(() => finalize(false), 15000)
        win.webContents.once('did-finish-load', () => {
          // Block any further navigation after the receipt page has loaded
          win.webContents.on('will-navigate', (e) => e.preventDefault())
          // Show the window so Chromium fully paints the content (hidden windows print blank)
          win.show()
          // Small delay to allow CSS to fully render before printing
          setTimeout(() => {
            win.webContents.print(
              {
                silent: false,
                printBackground: true,
                margins: { marginType: 'default' },
                pageSize: 'A4',
              },
              (success) => {
                clearTimeout(timeout)
                finalize(success)
              },
            )
          }, 500)
        })
        win.webContents.once('did-fail-load', () => {
          clearTimeout(timeout)
          finalize(false)
        })

        void win.loadFile(tempPath)
      })

      if (!result) return err('Print cancelled or failed')
      return ok(true)
    } catch (e) {
      log.error('print:receipt', e)
      return err('Failed to print receipt')
    }
  })
}

