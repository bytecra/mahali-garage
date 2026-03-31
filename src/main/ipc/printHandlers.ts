import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { authService } from '../services/authService'
import { settingsRepo } from '../database/repositories/settingsRepo'
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
  // ── print:receipt ──────────────────────────────────────────────────────────
  ipcMain.handle('print:receipt', async (event, html: unknown) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view')) {
        return err('Forbidden', 'ERR_FORBIDDEN')
      }
      if (typeof html !== 'string' || html.trim() === '') {
        return err('Invalid print payload', 'ERR_VALIDATION')
      }

      const behavior = settingsRepo.get('pdf_download_behavior') ?? 'ask'
      const folder   = settingsRepo.get('pdf_download_folder')   ?? ''

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
          try { unlinkSync(htmlPath) } catch { /* ignore */ }
          try { if (!win.isDestroyed()) win.close() } catch { /* ignore */ }
          resolve(success)
        }

        const timeout = setTimeout(() => finalize(false), 30000)

        win.webContents.once('did-finish-load', () => {
          // Block further navigation after the receipt page has loaded
          win.webContents.on('will-navigate', (e) => e.preventDefault())
          // Show the window so Chromium fully paints before capture
          win.show()
          // Wait for CSS/layout to fully render
          setTimeout(() => {
            win.webContents.printToPDF({
              pageSize: 'A4',
              printBackground: true,
              landscape: false,
              margins: { marginType: 'default' },
            })
              .then(async (pdfData) => {
                clearTimeout(timeout)

                if (behavior === 'download' && folder) {
                  // Auto-save to pre-selected folder
                  const pdfPath = path.join(folder, `receipt-${Date.now()}.pdf`)
                  writeFileSync(pdfPath, pdfData)
                  finalize(true)
                  void shell.openExternal(`file://${pdfPath}`)

                } else if (behavior === 'ask') {
                  // Show save dialog
                  const { filePath, canceled } = await dialog.showSaveDialog(parent ?? undefined, {
                    title: 'Save Receipt PDF',
                    defaultPath: path.join(
                      app.getPath('documents'),
                      `receipt-${Date.now()}.pdf`,
                    ),
                    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
                  })
                  if (!canceled && filePath) {
                    writeFileSync(filePath, pdfData)
                    finalize(true)
                    void shell.openExternal(`file://${filePath}`)
                  } else {
                    finalize(false)
                  }

                } else {
                  // 'none' or unknown — open in system PDF viewer from temp dir
                  const pdfPath = path.join(app.getPath('temp'), `receipt-${Date.now()}.pdf`)
                  writeFileSync(pdfPath, pdfData)
                  finalize(true)
                  void shell.openExternal(`file://${pdfPath}`)
                }
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

  // ── print:chooseDownloadFolder ─────────────────────────────────────────────
  ipcMain.handle('print:chooseDownloadFolder', async (event) => {
    try {
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const { filePaths, canceled } = await dialog.showOpenDialog(parent, {
        title: 'Choose PDF Download Folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (canceled || filePaths.length === 0) return ok(null)
      return ok(filePaths[0])
    } catch (e) {
      log.error('print:chooseDownloadFolder', e)
      return err('Failed to open folder dialog')
    }
  })
}
