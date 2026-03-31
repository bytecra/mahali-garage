import { BrowserWindow, app, ipcMain, shell } from 'electron'
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

      const htmlPath = path.join(app.getPath('temp'), `mahali-receipt-${Date.now()}.html`)
      writeFileSync(htmlPath, html, 'utf-8')

      const result = await new Promise<boolean>((resolve) => {
        let settled = false
        const finalize = (success: boolean): void => {
          if (settled) return
          settled = true
          try { unlinkSync(htmlPath) } catch { /* ignore cleanup failures */ }
          try { if (!win.isDestroyed()) win.close() } catch { /* ignore */ }
          resolve(success)
        }

        const timeout = setTimeout(() => finalize(false), 30000)

        win.webContents.once('did-finish-load', () => {
          // Block any further navigation after the receipt page has loaded
          win.webContents.on('will-navigate', (e) => e.preventDefault())
          // Show the window so Chromium fully paints the content (hidden windows render blank)
          win.show()
          // Allow CSS and layout to fully render before capturing
          setTimeout(() => {
            win.webContents.printToPDF({
              pageSize: 'A4',
              printBackground: true,
              landscape: false,
              margins: { marginType: 'default' },
            })
              .then((pdfData) => {
                const pdfPath = path.join(app.getPath('temp'), `mahali-receipt-${Date.now()}.pdf`)
                writeFileSync(pdfPath, pdfData)
                clearTimeout(timeout)
                finalize(true)
                // Open in the system PDF viewer — user can print or save from there
                void shell.openExternal(`file://${pdfPath}`)
              })
              .catch((e: unknown) => {
                log.error('printToPDF failed', e)
                clearTimeout(timeout)
                finalize(false)
              })
          }, 500)
        })

        win.webContents.once('did-fail-load', () => {
          clearTimeout(timeout)
          finalize(false)
        })

        void win.loadFile(htmlPath)
      })

      if (!result) return err('Print cancelled or failed')
      return ok(true)
    } catch (e) {
      log.error('print:receipt', e)
      return err('Failed to print receipt')
    }
  })
}
