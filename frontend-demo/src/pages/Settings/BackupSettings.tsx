import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HardDrive, FolderOpen, ExternalLink, Download, Clock, CheckCircle, XCircle } from 'lucide-react'
import { toast } from '../../store/notificationStore'
import { useAuthStore } from '../../store/authStore'

interface BackupConfig {
  enabled: boolean
  frequency: string
  time: string
  day_of_week: number
  backup_location: string
  retention_count: number
  last_backup_at: string | null
  last_backup_status: string | null
  last_backup_size: number | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function BackupSettings(): JSX.Element {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const isOwner = user?.role === 'owner'

  const [cfg, setCfg] = useState<BackupConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings(): Promise<void> {
    try {
      const res = await window.electronAPI.backup.getSettings() as { success: boolean; data?: BackupConfig }
      if (res.success && res.data) setCfg(res.data)
    } catch { /* */ } finally {
      setLoading(false)
    }
  }

  function set<K extends keyof BackupConfig>(key: K, val: BackupConfig[K]): void {
    setCfg(prev => prev ? { ...prev, [key]: val } : prev)
  }

  async function handleSave(): Promise<void> {
    if (!cfg) return
    setSaving(true)
    try {
      const res = await window.electronAPI.backup.updateSettings(cfg) as { success: boolean; error?: string }
      if (res.success) toast.success(t('backup.settingsSaved'))
      else toast.error(res.error ?? t('common.error'))
    } catch { toast.error(t('common.error')) } finally { setSaving(false) }
  }

  async function handleBackupNow(): Promise<void> {
    setBackingUp(true)
    try {
      const res = await window.electronAPI.backup.runNow() as { success: boolean; data?: { success: boolean; filePath?: string; message?: string } }
      if (res.success && res.data?.success) {
        toast.success(t('backup.backupSuccess'))
        loadSettings()
      } else {
        toast.error(res.data?.message ?? t('backup.backupFailed'))
      }
    } catch { toast.error(t('backup.backupFailed')) } finally { setBackingUp(false) }
  }

  async function handleRestore(): Promise<void> {
    const fileRes = await window.electronAPI.backup.selectFile() as { success: boolean; data?: string | null }
    if (!fileRes.success || !fileRes.data) return
    setRestoring(true)
    try {
      const res = await window.electronAPI.backup.restore(fileRes.data) as { success: boolean; data?: { success: boolean; error?: string } }
      if (res.success && res.data?.success) {
        toast.success('Database restored. Restart the app to apply changes.')
      } else {
        toast.error(res.data?.error ?? 'Restore failed')
      }
    } catch { toast.error('Restore failed') } finally { setRestoring(false) }
  }

  async function handleChooseFolder(): Promise<void> {
    const res = await window.electronAPI.backup.chooseFolder() as { success: boolean; data?: string | null }
    if (res.success && res.data) set('backup_location', res.data)
  }

  async function handleOpenFolder(): Promise<void> {
    if (cfg?.backup_location) {
      await window.electronAPI.backup.openFolder(cfg.backup_location)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    </div>
  )

  if (!cfg) return <div className="text-muted-foreground">{t('common.error')}</div>

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1 text-foreground'
  const btnPrimary = 'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60'

  return (
    <div className="space-y-6">
      {/* ── Automatic Backup Settings ── */}
      <div>
        <h3 className="font-semibold text-foreground mb-4">{t('backup.title')}</h3>

        {/* Enable toggle */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-sm font-medium text-foreground">{t('backup.enableBackups')}</p>
            <p className="text-xs text-muted-foreground">{t('backup.enableDesc')}</p>
          </div>
          <button
            onClick={() => set('enabled', !cfg.enabled)}
            disabled={!isOwner}
            className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? 'bg-primary' : 'bg-muted-foreground/30'} ${!isOwner ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Frequency */}
        <div className="mb-4">
          <label className={labelCls}>{t('backup.frequency')}</label>
          <select value={cfg.frequency} onChange={e => set('frequency', e.target.value)}
            disabled={!isOwner || !cfg.enabled} className={inputCls}>
            <option value="manual">{t('backup.manual')}</option>
            <option value="hourly">{t('backup.hourly')}</option>
            <option value="daily">{t('backup.daily')}</option>
            <option value="weekly">{t('backup.weekly')}</option>
          </select>
        </div>

        {/* Time (daily/weekly) */}
        {(cfg.frequency === 'daily' || cfg.frequency === 'weekly') && (
          <div className="mb-4">
            <label className={labelCls}>{t('backup.backupTime')}</label>
            <input type="time" value={cfg.time} onChange={e => set('time', e.target.value)}
              disabled={!isOwner || !cfg.enabled} className={inputCls} />
          </div>
        )}

        {/* Day of week (weekly) */}
        {cfg.frequency === 'weekly' && (
          <div className="mb-4">
            <label className={labelCls}>{t('backup.dayOfWeek')}</label>
            <select value={cfg.day_of_week} onChange={e => set('day_of_week', Number(e.target.value))}
              disabled={!isOwner || !cfg.enabled} className={inputCls}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}

        {/* Location */}
        <div className="mb-4">
          <label className={labelCls}>{t('backup.backupLocation')}</label>
          <div className="flex gap-2">
            <input readOnly value={cfg.backup_location} className={`${inputCls} flex-1 bg-muted/50 cursor-default text-xs`} />
            <button onClick={handleChooseFolder} disabled={!isOwner}
              className="px-3 py-2 border border-border rounded-md hover:bg-muted disabled:opacity-50" title="Choose folder">
              <FolderOpen className="w-4 h-4" />
            </button>
            <button onClick={handleOpenFolder}
              className="px-3 py-2 border border-border rounded-md hover:bg-muted" title="Open folder">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Retention */}
        <div className="mb-5">
          <label className={labelCls}>{t('backup.retention')}</label>
          <select value={cfg.retention_count} onChange={e => set('retention_count', Number(e.target.value))}
            disabled={!isOwner} className={inputCls}>
            <option value={5}>5 {t('backup.backups')}</option>
            <option value={10}>10 {t('backup.backups')}</option>
            <option value={30}>30 {t('backup.backups')}</option>
            <option value={0}>{t('backup.keepAll')}</option>
          </select>
        </div>

        {/* Save button */}
        {isOwner && (
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
        )}
      </div>

      {/* ── Last Backup Info ── */}
      {cfg.last_backup_at && (
        <div className={`border rounded-lg p-4 ${cfg.last_backup_status === 'success' ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}>
          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            {cfg.last_backup_status === 'success'
              ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            }
            {t('backup.lastBackup')}
          </h4>
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {new Date(cfg.last_backup_at).toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              {t('common.status')}: <span className={cfg.last_backup_status === 'success' ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                {cfg.last_backup_status === 'success' ? t('backup.statusSuccess') : t('backup.statusFailed')}
              </span>
            </p>
            {cfg.last_backup_size != null && cfg.last_backup_size > 0 && (
              <p className="text-muted-foreground">
                {t('backup.size')}: {(cfg.last_backup_size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Manual Actions ── */}
      <div className="border-t border-border pt-6">
        <h3 className="font-semibold text-foreground mb-1">{t('backup.manualActions')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('backup.manualDesc')}</p>
        <div className="flex gap-3">
          <button onClick={handleBackupNow} disabled={backingUp}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60">
            <Download className="w-4 h-4" />
            {backingUp ? t('backup.backingUp') : t('backup.backupNow')}
          </button>
          <button onClick={handleRestore} disabled={restoring}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-60">
            <HardDrive className="w-4 h-4" />
            {restoring ? t('common.loading') : t('backup.restoreBackup')}
          </button>
        </div>
      </div>
    </div>
  )
}
