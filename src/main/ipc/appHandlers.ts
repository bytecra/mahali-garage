import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { app, ipcMain, net, shell } from 'electron'
import bcrypt from 'bcryptjs'
import { getDb } from '../database'
import { getDeviceId } from '../licensing/device-fingerprint'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'

const LICENSE_HMAC_FALLBACK =
  '0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a'

function getResetHmacSecret(): string {
  return process.env.LICENSE_HMAC_SECRET || LICENSE_HMAC_FALLBACK
}

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
      if (/^mahali|garage/i.test(n)) s += 1
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
        'https://api.github.com/repos/bytecra/mahali-garage/releases/latest',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Mahali-Garage-App',
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
      const rawName = url.split('/').pop() ?? 'mahali-garage-update.exe'
      const baseClean = rawName.split('?')[0] || 'setup.exe'
      const ext = path.extname(baseClean) || (process.platform === 'win32' ? '.exe' : '')
      const fileName = `mahali-garage-update-${Date.now()}${ext}`
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

  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.trim()) return
    await shell.openExternal(url.trim())
  })

  ipcMain.handle('auth:generateResetCode', async (_event, username: string) => {
    try {
      const deviceId = getDeviceId()
      const secret = getResetHmacSecret()

      const hourTimestamp = Math.floor(Date.now() / (1000 * 60 * 60))

      const payload = `${deviceId}:${username}:${hourTimestamp}`

      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
        .toUpperCase()
        .slice(0, 12)

      const code = `MH-${hash.slice(0, 6)}-${hash.slice(6, 12)}`

      const db = getDb()
      db.prepare(`
      INSERT OR IGNORE INTO dev_reset_codes
        (code, username, device_id)
      VALUES (?, ?, ?)
    `).run(code, username, deviceId)

      return ok({ code, deviceId })
    } catch (e) {
      log.error('auth:generateResetCode', e)
      return err('Failed')
    }
  })

  ipcMain.handle(
    'auth:resetPassword',
    async (
      _event,
      params: {
        code: string
        username: string
        newPassword: string
      }
    ) => {
      try {
        const { code, username, newPassword } = params

        if (!code || !username || !newPassword)
          return err('Missing fields', 'ERR_VALIDATION')

        if (newPassword.length < 4)
          return err('Password too short', 'ERR_VALIDATION')

        const deviceId = getDeviceId()
        const secret = getResetHmacSecret()

        const db = getDb()

        const stored = db.prepare(`
      SELECT * FROM dev_reset_codes
      WHERE code = ? 
      AND username = ?
      AND device_id = ?
      AND used = 0
    `).get(code.toUpperCase().trim(), username, deviceId) as { id: number } | undefined

        if (!stored)
          return err('Invalid or expired reset code', 'ERR_INVALID_CODE')

        const hourNow = Math.floor(Date.now() / (1000 * 60 * 60))

        let valid = false
        for (const h of [hourNow, hourNow - 1]) {
          const payload = `${deviceId}:${username}:${h}`
          const expected = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')
            .toUpperCase()
            .slice(0, 12)
          const expectedCode = `MH-${expected.slice(0, 6)}-${expected.slice(6, 12)}`
          if (expectedCode === code.toUpperCase().trim()) {
            valid = true
            break
          }
        }

        if (!valid)
          return err('Reset code has expired', 'ERR_EXPIRED_CODE')

        const hash = await bcrypt.hash(newPassword, 10)

        const result = db.prepare(`
      UPDATE users 
      SET password_hash = ?,
          updated_at = datetime('now')
      WHERE username = ?
    `).run(hash, username)

        if (result.changes === 0)
          return err('User not found', 'ERR_NOT_FOUND')

        db.prepare(`
      UPDATE dev_reset_codes
      SET used = 1
      WHERE id = ?
    `).run(stored.id)

        return ok({ success: true })
      } catch (e) {
        log.error('auth:resetPassword', e)
        return err('Failed to reset password')
      }
    }
  )
}
