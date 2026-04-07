import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { unlinkSync } from 'fs'
import path from 'path'
import sharp from 'sharp'
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
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })
}

/** Sized for ID card HTML (85.6×54mm); higher zoom for sharper PNG capture */
function createIdCardWindow(parent: BrowserWindow | null): BrowserWindow {
  return new BrowserWindow({
    width: 420,
    height: 280,
    show: false,
    parent: parent ?? undefined,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      zoomFactor: 1.5,
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
      await writeFile(htmlPath, html, 'utf-8')

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
                  await writeFile(pdfPath, pdfData)
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
                    await writeFile(filePath, pdfData)
                    finalize(true)
                    void shell.openExternal(`file://${filePath}`)
                  } else {
                    finalize(false)
                  }

                } else {
                  // 'none' or unknown — open in system PDF viewer from temp dir
                  const pdfPath = path.join(app.getPath('temp'), `receipt-${Date.now()}.pdf`)
                  await writeFile(pdfPath, pdfData)
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

  // ── print:idCard ───────────────────────────────────────────────────────────
  ipcMain.handle('print:idCard', async (event, html: unknown, format?: unknown) => {
    try {
      if (!authService.getSession(event.sender.id)) {
        return err('Forbidden', 'ERR_FORBIDDEN')
      }

      if (typeof html !== 'string' || !html.trim()) {
        return err('Invalid HTML', 'ERR_VALIDATION')
      }

      const wantPng = format === 'png'
      const parent = BrowserWindow.fromWebContents(event.sender) ?? null
      const win = wantPng ? createIdCardWindow(parent) : createPrintWindow(parent)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      const htmlPath = path.join(app.getPath('temp'), `mahali-idcard-${Date.now()}.html`)
      await writeFile(htmlPath, html, 'utf-8')

      const result = await new Promise<Buffer | null>((resolve) => {
        let settled = false
        const finalize = (buf: Buffer | null): void => {
          if (settled) return
          settled = true
          try {
            unlinkSync(htmlPath)
          } catch {
            /* ignore */
          }
          try {
            if (!win.isDestroyed()) win.close()
          } catch {
            /* ignore */
          }
          resolve(buf)
        }

        const timeout = setTimeout(() => finalize(null), 30000)

        win.webContents.once('did-finish-load', () => {
          win.webContents.on('will-navigate', (e) => e.preventDefault())
          win.show()
          const delay = wantPng ? 650 : 500
          setTimeout(() => {
            void (async () => {
              try {
                if (wantPng) {
                  const shot = await win.webContents.capturePage()
                  const raw = shot.toPNG()
                  const processed = await sharp(raw)
                    .resize(2550, 1600, {
                      fit: 'contain',
                      kernel: sharp.kernel.lanczos3,
                      background: { r: 255, g: 255, b: 255, alpha: 1 },
                    })
                    .extend({
                      top: 10,
                      bottom: 10,
                      left: 10,
                      right: 10,
                      background: '#e2e8f0',
                    })
                    .png()
                    .toBuffer()
                  clearTimeout(timeout)
                  finalize(processed)
                } else {
                  const pdf = await win.webContents.printToPDF({
                    pageSize: {
                      width: 85600,
                      height: 54000,
                    },
                    printBackground: true,
                    landscape: false,
                    margins: { marginType: 'none' },
                  })
                  clearTimeout(timeout)
                  finalize(pdf)
                }
              } catch {
                clearTimeout(timeout)
                finalize(null)
              }
            })()
          }, delay)
        })

        win.webContents.once('did-fail-load', () => {
          clearTimeout(timeout)
          finalize(null)
        })

        void win.loadFile(htmlPath)
      })

      if (!result) {
        return err(wantPng ? 'Failed to generate PNG' : 'Failed to generate PDF')
      }

      let savePath: string
      if (wantPng) {
        const dir = path.join(app.getPath('userData'), 'employees', 'id-cards-png')
        mkdirSync(dir, { recursive: true })
        savePath = path.join(dir, `employee-id-${Date.now()}.png`)
      } else {
        savePath = path.join(app.getPath('downloads'), `employee-id-${Date.now()}.pdf`)
      }
      await writeFile(savePath, result)
      shell.showItemInFolder(savePath)
      return ok({ filePath: savePath })
    } catch (e) {
      log.error('print:idCard', e)
      return err('Failed to generate ID card')
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

  // ── print:listPrinters ─────────────────────────────────────────────────────
  ipcMain.handle('print:listPrinters', async (event) => {
    try {
      if (!authService.getSession(event.sender.id))
        return err('Forbidden', 'ERR_FORBIDDEN')
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return err('No window')
      const printers = await win.webContents.getPrintersAsync()
      return ok(printers.map(p => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: p.isDefault,
        status: p.status,
      })))
    } catch (e) {
      log.error('print:listPrinters', e)
      return err('Failed to list printers')
    }
  })

  // ── print:thermal ──────────────────────────────────────────────────────────
  ipcMain.handle('print:thermal', async (event, html: unknown, printerName: unknown) => {
    try {
      if (!authService.hasPermission(event.sender.id, 'sales.view'))
        return err('Forbidden', 'ERR_FORBIDDEN')

      if (typeof html !== 'string' || html.trim() === '')
        return err('Invalid HTML', 'ERR_VALIDATION')

      if (typeof printerName !== 'string' || printerName.trim() === '')
        return err('No printer selected', 'ERR_VALIDATION')

      const parent = BrowserWindow.fromWebContents(event.sender) ?? null
      const win = createPrintWindow(parent)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

      const htmlPath = path.join(app.getPath('temp'), `mahali-thermal-${Date.now()}.html`)
      await writeFile(htmlPath, html, 'utf-8')

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
          win.webContents.on('will-navigate', (e) => e.preventDefault())
          setTimeout(() => {
            win.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: printerName.trim(),
                margins: { marginType: 'none' },
                pageSize: { width: 80000, height: 297000 },
              },
              (success, failureReason) => {
                clearTimeout(timeout)
                if (!success) {
                  log.error('print:thermal failed:', failureReason)
                }
                finalize(success)
              }
            )
          }, 500)
        })

        win.webContents.once('did-fail-load', () => {
          clearTimeout(timeout)
          finalize(false)
        })

        void win.loadFile(htmlPath)
      })

      if (!result) return err('Thermal print failed or cancelled')
      return ok(true)
    } catch (e) {
      log.error('print:thermal', e)
      return err('Failed to print thermal receipt')
    }
  })
}
