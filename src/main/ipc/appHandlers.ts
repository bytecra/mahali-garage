import fs from 'fs'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { app, ipcMain, net, shell } from 'electron'
import { authService } from '../services/authService'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

function compareVersions(current: string, latest: string): boolean {
  const c = current.split('.').map(Number)
  const l = latest.split('.').map(Number)
  const len = Math.max(c.length, l.length)
  for (let i = 0; i < len; i++) {
    const cv = c[i] ?? 0
    const lv = l[i] ?? 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}

/** Pick installer from GitHub release assets for the current OS (Squirrel/NSIS .exe on Windows, .dmg on macOS, etc.). */
function pickReleaseAsset(
  assets: Array<{ name: string; browser_download_url: string; size: number }>,
): { name: string; browser_download_url: string; size: number } | undefined {
  if (!assets?.length) return undefined
  const plat = process.platform

  const score = (name: string): number => {
    const n = name.toLowerCase()
    let s = 0
    if (plat === 'win32') {
      if (n.endsWith('.exe')) s += 5
      if (n.endsWith('.msi')) s += 4
      if (/setup|installer|squirrel|full|x64|win64|amd64/i.test(n)) s += 3
      if (/^power.key/i.test(n)) s += 1
    } else if (plat === 'darwin') {
      if (n.endsWith('.dmg')) s += 5
      if (n.endsWith('.pkg')) s += 4
    } else {
      if (/\.appimage$/i.test(n)) s += 5
      if (n.endsWith('.deb')) s += 3
    }
    return s
  }

  const candidates = assets.filter((a) => {
    const n = a.name.toLowerCase()
    if (plat === 'win32') {
      return n.endsWith('.exe') || n.endsWith('.msi')
    }
    if (plat === 'darwin') {
      return n.endsWith('.dmg') || n.endsWith('.pkg') || n.endsWith('.zip')
    }
    return /\.(appimage|deb|rpm)$/i.test(n) || n.endsWith('.zip')
  })

  if (!candidates.length) return undefined

  const sorted = [...candidates].sort((a, b) => score(b.name) - score(a.name))
  return sorted[0]
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      const currentVersion = app.getVersion()
      const response = await fetch(
        'https://api.github.com/repos/bytecra/power-key/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Power-Key-App',
          },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (!response.ok) {
        return {
          success: true,
          data: {
            hasUpdate: false,
            currentVersion,
            error: 'Could not reach GitHub',
          },
        }
      }
      const data = await response.json() as {
        tag_name: string
        name: string
        html_url: string
        published_at: string
        body: string
        assets?: Array<{
          name: string
          browser_download_url: string
          size: number
        }>
      }
      const latestVersion = data.tag_name.replace(/^v/, '')

      const hasUpdate = compareVersions(currentVersion, latestVersion)

      const assets = data.assets ?? []
      const picked = pickReleaseAsset(assets)

      return {
        success: true,
        data: {
          hasUpdate,
          currentVersion,
          latestVersion,
          releaseName: data.name,
          releaseUrl: data.html_url,
          publishedAt: data.published_at,
          releaseNotes: (data.body ?? '').slice(0, 300),
          downloadUrl: picked?.browser_download_url ?? null,
          downloadSize: picked?.size ?? null,
        },
      }
    } catch {
      return {
        success: true,
        data: {
          hasUpdate: false,
          currentVersion: app.getVersion(),
          error: 'No internet or GitHub unreachable',
        },
      }
    }
  })

  ipcMain.handle('app:downloadUpdate', async (event, downloadUrl: string) => {
    try {
      if (typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
        return { success: false, error: 'Invalid download URL' }
      }
      const url = downloadUrl.trim()
      const downloadsPath = app.getPath('downloads')
      const rawName = url.split('/').pop() ?? 'power-key-update.exe'
      const baseClean = rawName.split('?')[0] || 'setup.exe'
      const ext = path.extname(baseClean) || (process.platform === 'win32' ? '.exe' : '')
      const fileName = `power-key-update-${Date.now()}${ext}`
      const destPath = path.join(downloadsPath, fileName)

      return await new Promise<
        | { success: true; data: { filePath: string; fileName: string } }
        | { success: false; error: string }
      >((resolve) => {
        const request = net.request(url)

        let totalBytes = 0
        let downloadedBytes = 0

        request.on('response', (response) => {
          const code = response.statusCode ?? 0
          if (code < 200 || code >= 300) {
            resolve({
              success: false,
              error: `Download failed: HTTP ${code}`,
            })
            return
          }

          const contentLength = response.headers['content-length']
          totalBytes = contentLength
            ? parseInt(
                Array.isArray(contentLength) ? contentLength[0] : contentLength,
                10
              )
            : 0

          const fileStream = fs.createWriteStream(destPath)
          const progressTransform = new Transform({
            transform(chunk: Buffer, _enc, callback) {
              downloadedBytes += chunk.length
              const progress =
                totalBytes > 0
                  ? Math.round((downloadedBytes / totalBytes) * 100)
                  : -1
              try {
                event.sender.send('app:downloadProgress', {
                  progress,
                  downloadedBytes,
                  totalBytes,
                })
              } catch {
                // renderer gone
              }
              callback(null, chunk)
            },
          })

          pipeline(response, progressTransform, fileStream)
            .then(() => {
              resolve({
                success: true,
                data: {
                  filePath: destPath,
                  fileName,
                },
              })
            })
            .catch((err: Error) => {
              try {
                fs.unlinkSync(destPath)
              } catch {
                // ignore
              }
              resolve({
                success: false,
                error: 'Download failed: ' + err.message,
              })
            })
        })

        request.on('error', (err: Error) => {
          resolve({
            success: false,
            error: 'Request failed: ' + err.message,
          })
        })

        request.end()
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Download failed'
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('app:installUpdate', async (_event, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return { success: false, error: 'Invalid file path' }
      }
      const errMsg = await shell.openPath(filePath.trim())
      if (errMsg) {
        return { success: false, error: errMsg }
      }
      setTimeout(() => {
        app.quit()
      }, 2000)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to open installer'
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('shell:openExternal', async (event, url: unknown) => {
    if (typeof url !== 'string' || !url.trim()) return
    const trimmed = url.trim()
    if (!trimmed.startsWith('https://')) return
    if (!authService.getSession(event.sender.id)) return
    await shell.openExternal(trimmed)
  })

  ipcMain.handle('app:setZoom', (event, factor: unknown) => {
    const f = Number(factor)
    if (!Number.isFinite(f) || f < 0.5 || f > 2.0) return
    event.sender.setZoomFactor(f)
  })

  ipcMain.handle('app:getZoom', (event) => {
    return event.sender.getZoomFactor()
  })

}
