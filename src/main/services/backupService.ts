import path from 'path'
import fs from 'fs'
import { app, dialog } from 'electron'
import { getDb, closeDatabase } from '../database/index'
import log from '../utils/logger'

function defaultBackupDir(): string {
  const dir = path.join(app.getPath('documents'), 'Power Key Backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export const backupService = {
  async create(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const db = getDb()
      const dir = defaultBackupDir()
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const destPath = path.join(dir, `mahali-backup-${ts}.db`)

      // SQLite online backup using VACUUM INTO (available in SQLite 3.27+)
      db.prepare(`VACUUM INTO ?`).run(destPath)

      log.info(`Backup created: ${destPath}`)
      return { success: true, filePath: destPath }
    } catch (e) {
      log.error('Backup create failed', e)
      return { success: false, error: e instanceof Error ? e.message : 'Backup failed' }
    }
  },

  async selectFile(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select Power Key Backup',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  },

  async restore(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup file not found' }

      const dbPath = path.join(app.getPath('userData'), 'mahali.db')
      const archivePath = `${dbPath}.pre-restore`

      // Archive current DB before touching anything
      fs.copyFileSync(dbPath, archivePath)

      // Close the live connection so WAL is flushed and the file lock is released
      closeDatabase()

      // Overwrite with the backup
      fs.copyFileSync(backupPath, dbPath)

      log.info(`Backup restored from: ${backupPath}. Relaunching app.`)

      // Relaunch so the new DB is opened cleanly on startup
      app.relaunch()
      setTimeout(() => app.quit(), 500)

      return { success: true }
    } catch (e) {
      log.error('Backup restore failed', e)
      return { success: false, error: e instanceof Error ? e.message : 'Restore failed' }
    }
  },
}
