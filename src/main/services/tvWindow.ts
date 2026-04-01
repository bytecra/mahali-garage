import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import { settingsRepo } from '../database/repositories/settingsRepo'

let tvWindow: BrowserWindow | null = null

function resolveTargetDisplayIndex(): number {
  const displays = screen.getAllDisplays()
  if (displays.length <= 1) return 0

  const saved = settingsRepo.get('tv_display_screen')
  const parsed = Number(saved ?? '')
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < displays.length) return parsed
  return 1
}

export function openTvWindow(): BrowserWindow {
  if (tvWindow && !tvWindow.isDestroyed()) {
    tvWindow.show()
    tvWindow.focus()
    return tvWindow
  }

  const displays = screen.getAllDisplays()
  const displayIndex = resolveTargetDisplayIndex()
  const targetDisplay = displays[displayIndex] ?? screen.getPrimaryDisplay()
  const { x, y, width, height } = targetDisplay.bounds

  tvWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    fullscreen: false,
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
    tvWindow.setBounds({ x, y, width, height })
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

  return tvWindow
}

