import { app, BrowserWindow, ipcMain, shell, globalShortcut } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { initDatabase } from './database/index'
import { registerAllHandlers } from './ipc/index'
import { checkLicense } from './licensing/license-manager'
import { initBackupScheduler, stopBackupScheduler } from './services/backupScheduler'
import { initPayrollScheduler, stopPayrollScheduler } from './services/payrollScheduler'

log.initialize()
log.info('App starting...')

let mainWindow: BrowserWindow | null = null
let activationWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (!details.url.startsWith('about:')) {
      if (details.url.startsWith('https://')) {
        shell.openExternal(details.url)
      } else {
        log.warn(`Blocked non-https external URL: ${details.url}`)
      }
    }
    return { action: 'deny' }
  })

  // Allow F12 to toggle DevTools for debugging
  globalShortcut.register('F12', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win.webContents.openDevTools()
      }
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Use pathToFileURL to ensure spaces in the install path are properly encoded
    mainWindow.loadURL(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
  }
}

function createActivationWindow(): void {
  activationWindow = new BrowserWindow({
    width: 520,
    height: 520,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    title: 'Activate Mahali Garage',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  })

  activationWindow.on('closed', () => {
    activationWindow = null
    // If user closes activation window without activating, quit the app
    if (!mainWindow) app.quit()
  })

  activationWindow.on('ready-to-show', () => {
    activationWindow?.show()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    activationWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '/activation.html')
  } else {
    activationWindow.loadURL(pathToFileURL(join(__dirname, '../renderer/activation.html')).href)
  }
}

function openMainOrActivation(): void {
  const status = checkLicense()
  if (status.valid && status.licensed) {
    if (status.daysRemaining !== null && status.daysRemaining < 7) {
      log.warn(`License expiring in ${status.daysRemaining} day(s)`)
    }
    createWindow()
  } else {
    createActivationWindow()
  }
}

app.whenReady().then(async () => {
  try {
    // Initialize database and run migrations
    await initDatabase()
    log.info('Database initialized successfully')

    // Register all IPC handlers (includes license + app:licenseActivated listener)
    registerAllHandlers()
    log.info('IPC handlers registered')

    // Listen for successful activation so we can open the main window
    ipcMain.once('app:licenseActivated', () => {
      if (activationWindow) {
        activationWindow.close()
        activationWindow = null
      }
      createWindow()
    })

    initBackupScheduler()
    initPayrollScheduler()

    openMainOrActivation()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openMainOrActivation()
    })
  } catch (error) {
    log.error('Failed to initialize app:', error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  stopBackupScheduler()
  stopPayrollScheduler()
  globalShortcut.unregisterAll()
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
