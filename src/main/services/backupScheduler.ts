import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { getDb } from '../database/index'
import log from '../utils/logger'

export interface BackupConfig {
  enabled: boolean
  frequency: 'manual' | 'hourly' | 'daily' | 'weekly'
  time: string      // HH:MM
  day_of_week: number // 0 = Sunday … 6 = Saturday
  backup_location: string
  retention_count: number
  last_backup_at: string | null
  last_backup_status: string | null
  last_backup_size: number | null
}

const CHECK_INTERVAL_MS = 60_000 // check every 60 s

let timer: ReturnType<typeof setInterval> | null = null

function defaultBackupDir(): string {
  return path.join(app.getPath('documents'), 'Mahali Garage Backups')
}

export function getBackupSettings(): BackupConfig {
  try {
    const db = getDb()
    const row = db.prepare('SELECT * FROM backup_settings WHERE id = 1').get() as Record<string, unknown> | undefined
    if (!row) return defaultConfig()
    return {
      enabled: row.enabled === 1,
      frequency: (row.frequency as string) as BackupConfig['frequency'],
      time: (row.time as string) || '02:00',
      day_of_week: (row.day_of_week as number) ?? 0,
      backup_location: (row.backup_location as string) || defaultBackupDir(),
      retention_count: (row.retention_count as number) ?? 5,
      last_backup_at: (row.last_backup_at as string) || null,
      last_backup_status: (row.last_backup_status as string) || null,
      last_backup_size: (row.last_backup_size as number) || null,
    }
  } catch {
    return defaultConfig()
  }
}

function defaultConfig(): BackupConfig {
  return {
    enabled: true,
    frequency: 'daily',
    time: '02:00',
    day_of_week: 0,
    backup_location: defaultBackupDir(),
    retention_count: 5,
    last_backup_at: null,
    last_backup_status: null,
    last_backup_size: null,
  }
}

export function updateBackupSettings(cfg: Partial<BackupConfig>): void {
  const db = getDb()
  db.prepare(`
    UPDATE backup_settings SET
      enabled = COALESCE(?, enabled),
      frequency = COALESCE(?, frequency),
      time = COALESCE(?, time),
      day_of_week = COALESCE(?, day_of_week),
      backup_location = COALESCE(?, backup_location),
      retention_count = COALESCE(?, retention_count),
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    cfg.enabled !== undefined ? (cfg.enabled ? 1 : 0) : null,
    cfg.frequency ?? null,
    cfg.time ?? null,
    cfg.day_of_week ?? null,
    cfg.backup_location ?? null,
    cfg.retention_count ?? null,
  )
}

function shouldRunNow(cfg: BackupConfig): boolean {
  if (!cfg.enabled || cfg.frequency === 'manual') return false

  const now = new Date()
  const [targetH, targetM] = cfg.time.split(':').map(Number)
  const nowH = now.getHours()
  const nowM = now.getMinutes()
  const nowDay = now.getDay()

  // Only fire within the target minute window
  const timeMatch = nowH === targetH && nowM === targetM
  const dayMatch = cfg.frequency !== 'weekly' || nowDay === cfg.day_of_week
  const hourlyMatch = cfg.frequency === 'hourly' && nowM === 0 // top of every hour

  const trigger =
    cfg.frequency === 'hourly' ? hourlyMatch :
    (cfg.frequency === 'daily' || cfg.frequency === 'weekly') ? (timeMatch && dayMatch) :
    false

  if (!trigger) return false

  // Prevent duplicate runs within the same minute
  if (cfg.last_backup_at) {
    const last = new Date(cfg.last_backup_at)
    const diffMs = now.getTime() - last.getTime()
    if (diffMs < CHECK_INTERVAL_MS * 1.5) return false
  }

  return true
}

export function performBackup(cfg?: BackupConfig): { success: boolean; message: string; filePath?: string } {
  try {
    const settings = cfg ?? getBackupSettings()
    const dir = settings.backup_location || defaultBackupDir()

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const destPath = path.join(dir, `mahali-garage-backup-${ts}.db`)

    const db = getDb()
    db.prepare('VACUUM INTO ?').run(destPath)

    const size = fs.statSync(destPath).size

    // Record success
    try {
      db.prepare(`
        UPDATE backup_settings
        SET last_backup_at = datetime('now'), last_backup_status = 'success', last_backup_size = ?
        WHERE id = 1
      `).run(size)
    } catch { /* migration may not have run yet */ }

    rotateBackups(dir, settings.retention_count)

    log.info(`Backup created: ${destPath} (${(size / 1024).toFixed(0)} KB)`)
    return { success: true, message: 'Backup created successfully', filePath: destPath }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Backup failed'
    log.error('Backup failed:', e)

    try {
      getDb().prepare(`
        UPDATE backup_settings SET last_backup_status = 'failed' WHERE id = 1
      `).run()
    } catch { /* */ }

    return { success: false, message: msg }
  }
}

function rotateBackups(dir: string, keep: number): void {
  if (keep <= 0) return // 0 = keep all

  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('mahali-garage-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime) // newest first

    for (const old of files.slice(keep)) {
      fs.unlinkSync(old.full)
      log.info(`Rotated old backup: ${old.name}`)
    }
  } catch (e) {
    log.error('Backup rotation error:', e)
  }
}

function tick(): void {
  try {
    const cfg = getBackupSettings()
    if (shouldRunNow(cfg)) {
      log.info('Scheduled backup triggered')
      performBackup(cfg)
    }
  } catch (e) {
    log.error('Backup scheduler tick error:', e)
  }
}

export function initBackupScheduler(): void {
  if (timer) return
  log.info('Backup scheduler started (checking every 60 s)')
  timer = setInterval(tick, CHECK_INTERVAL_MS)
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    log.info('Backup scheduler stopped')
  }
}
