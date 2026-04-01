import { BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'

let tvWindow: BrowserWindow | null = null

export function openTvWindow(): void {
  if (tvWindow && !tvWindow.isDestroyed()) {
    tvWindow.show()
    tvWindow.focus()
    return
  }

  tvWindow = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    fullscreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  })

  tvWindow.on('ready-to-show', () => {
    if (!tvWindow) return
    tvWindow.show()
    tvWindow.maximize()
  })

  tvWindow.on('closed', () => {
    tvWindow = null
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    tvWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '/tv-display')
  } else {
    const base = pathToFileURL(join(__dirname, '../renderer/index.html')).href
    tvWindow.loadURL(`${base}#/tv-display`)
  }
}

