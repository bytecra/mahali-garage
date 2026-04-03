import { app, ipcMain, shell } from 'electron'

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
      }
      const latestVersion = data.tag_name.replace(/^v/, '')

      const parseV = (v: string): [number, number, number] => {
        const p = v.split('.').map(part => {
          const n = Number(part)
          return Number.isFinite(n) ? n : 0
        })
        return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]
      }
      const [ma, mi, pa] = parseV(currentVersion)
      const [la, li, lp] = parseV(latestVersion)
      const hasUpdate =
        la > ma ||
        (la === ma && li > mi) ||
        (la === ma && li === mi && lp > pa)

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

  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.trim()) return
    await shell.openExternal(url.trim())
  })
}
