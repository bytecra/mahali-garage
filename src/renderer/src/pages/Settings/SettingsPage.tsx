import { useState, useEffect, useCallback, lazy, Suspense, useRef, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertCircle, Upload, Plus, X, Keyboard } from 'lucide-react'
import { toast } from '../../store/notificationStore'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useLangStore } from '../../store/langStore'
import { useBrandingStore } from '../../store/brandingStore'
import { useCurrencyStore } from '../../store/currencyStore'
import { usePermission } from '../../hooks/usePermission'
import { DASHBOARD_WIDGETS, parseDashboardWidgets } from '../../lib/dashboardWidgets'
import { TV_DISPLAY_WIDGETS, parseTvDisplayWidgets } from '../../lib/tvDisplayWidgets'

/** `employees:chooseFile` returns `fileBuffer` (number[]), not base64 — encode for `storeDocuments:upload`. */
function fileBufferToBase64(fileBuffer: number[]): string {
  const u8 = new Uint8Array(fileBuffer.length)
  for (let i = 0; i < fileBuffer.length; i++) u8[i] = fileBuffer[i]!
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

const APP_SHORTCUT_DEFAULTS: Record<string, string> = {
  smart_recipe: 'ctrl+shift+s',
  custom_recipe: 'ctrl+shift+c',
  tv_on: 'ctrl+shift+t',
  tv_off: 'ctrl+shift+w',
  add_customer: 'ctrl+shift+u',
  add_vehicle: 'ctrl+shift+v',
}

const JobTypesSettings  = lazy(() => import('./JobTypesSettings'))
const CarBrandsSettings = lazy(() => import('./CarBrandsSettings'))
const BackupSettingsTab = lazy(() => import('./BackupSettings'))

const DEFAULT_LOYALTY = {
  enabled: false,
  deptMode: 'combined' as 'combined' | 'per_dept',
  type: 'points' as 'points' | 'stamps' | 'tiers' | 'all',
  pointsPerAed: 1,
  pointsLabel: 'Points',
  stampsPerVisit: 1,
  stampsForReward: 10,
  stampRewardDesc: 'Free service',
  tier1Visits: 5, tier1Discount: 5,
  tier2Visits: 10, tier2Discount: 10,
  tier3Visits: 20, tier3Discount: 15,
  autoEarnInvoice: true,
  autoEarnReceipt: true,
  allowManualAdjust: true,
  showInProfile: true,
  showOnReceipt: true,
}

const DEFAULT_EMP_ID_FORMAT = {
  prefix: 'EMP',
  separator: '-',
  useYear: false,
  padding: 3,
  startFrom: 1,
}

type Tab = 'store' | 'invoice' | 'tax' | 'appearance' | 'payment' | 'backup' | 'license' | 'activity' | 'job-types' | 'car-brands' | 'dashboard' | 'payroll' | 'tv-display' | 'shortcuts' | 'loyalty' | 'employees' | 'attendance' | 'store-documents' | 'about'

interface CarBrand { id: number; name: string; logo: string | null }

interface ActivityRow {
  id: number; user_id: number | null; full_name: string | null
  action: string; entity: string | null; entity_id: number | null
  details: string | null; created_at: string
}

interface LicenseStatus {
  valid: boolean
  licensed: boolean
  hwMatch?: boolean
  gracePeriod?: boolean
  graceUntil?: string | null
  reason?: string
  type?: string
  daysRemaining?: number | null
  expiresAt?: number | null
}

interface TvDisplayOption {
  index: number
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
}

interface StoreDocumentRow {
  id: number
  name: string
  doc_type: string
  file_name: string
  file_path: string
  has_expiry: number
  expiry_date: string | null
  notes: string | null
  uploaded_by_name: string | null
  created_at: string
}

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const { setBranding } = useBrandingStore()
  const { syncFromSettings: syncCurrency } = useCurrencyStore()
  const canBackup      = usePermission('backup.manage')
  const canSettings    = usePermission('settings.manage')
  const canActivityLog = usePermission('activity_log.view')
  const user = useAuthStore(s => s.user)
  const canStoreDocuments = user?.role === 'owner' || user?.role === 'manager'
  const [tab, setTab] = useState<Tab>('store')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [licStatus, setLicStatus] = useState<LicenseStatus | null>(null)
  const [licKey, setLicKey] = useState('')
  const [hwId, setHwId] = useState('')
  const [activating, setActivating] = useState(false)
  const [brands, setBrands] = useState<CarBrand[]>([])
  const [tvDisplays, setTvDisplays] = useState<TvDisplayOption[]>([])
  const [shortcutsState, setShortcutsState] = useState<Record<string, string>>(() => ({ ...APP_SHORTCUT_DEFAULTS }))
  const [loyaltyConfig, setLoyaltyConfig] = useState(DEFAULT_LOYALTY)
  const [loyaltySaving, setLoyaltySaving] = useState(false)
  const [printerList, setPrinterList] = useState<Array<{
    name: string
    displayName: string
    isDefault: boolean
  }>>([])
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<{
    checked: boolean
    checking: boolean
    hasUpdate: boolean
    latestVersion?: string
    releaseName?: string
    releaseUrl?: string
    publishedAt?: string
    releaseNotes?: string
    error?: string
    downloadUrl?: string | null
    downloadSize?: number | null
  }>({
    checked: false,
    checking: false,
    hasUpdate: false,
  })

  const [downloadState, setDownloadState] = useState<{
    downloading: boolean
    progress: number
    filePath: string | null
    error: string | null
    done: boolean
  }>({
    downloading: false,
    progress: 0,
    filePath: null,
    error: null,
    done: false,
  })

  const [attendanceStatuses, setAttendanceStatuses] = useState<
    Array<{
      id: number
      name: string
      color: string
      emoji: string
      is_default: number
      is_paid: number
      counts_as_working: number
      sort_order: number
    }>
  >([])

  const [statusForm, setStatusForm] = useState({
    name: '',
    color: '#6b7280',
    emoji: '',
    is_paid: 1,
    counts_as_working: 0,
  })

  const [editingStatusId, setEditingStatusId] = useState<number | null>(null)

  const [showStatusForm, setShowStatusForm] = useState(false)

  const [statusSaving, setStatusSaving] = useState(false)

  const [storeDocs, setStoreDocs] = useState<StoreDocumentRow[]>([])

  const [storeDocForm, setStoreDocForm] = useState({
    name: '',
    doc_type: 'trade_license',
    has_expiry: 1,
    expiry_date: '',
    notes: '',
  })

  const [storeDocFile, setStoreDocFile] = useState<{
    name: string
    data: string
    size: number
  } | null>(null)

  const [showStoreDocForm, setShowStoreDocForm] = useState(false)

  const [storeDocSaving, setStoreDocSaving] = useState(false)

  const [empIdFormat, setEmpIdFormat] = useState({ ...DEFAULT_EMP_ID_FORMAT })
  const [empIdPreview, setEmpIdPreview] = useState('')
  const [empIdSaving, setEmpIdSaving] = useState(false)

  const setLC = <K extends keyof typeof DEFAULT_LOYALTY>(
    key: K,
    val: (typeof DEFAULT_LOYALTY)[K]
  ) => setLoyaltyConfig(prev => ({ ...prev, [key]: val }))

  // Activity log state
  const [activityRows, setActivityRows]   = useState<ActivityRow[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityPage, setActivityPage]   = useState(0)
  const [actFromDate, setActFromDate]     = useState('')
  const [actToDate, setActToDate]         = useState('')
  const ACTIVITY_PAGE_SIZE = 50
  const MAX_LOGO_BYTES = 1_500_000

  async function loadPrinters(): Promise<void> {
    try {
      const res = await window.electronAPI.print.listPrinters()
      if (res?.success && Array.isArray(res.data)) {
        setPrinterList(res.data)
      }
    } catch { /* non-fatal */ }
  }

  const load = async () => {
    const res = await window.electronAPI.settings.getAll()
    if (res.success) {
      const data = res.data as Record<string, string>
      setSettings(data)
      syncCurrency(data)
    }
    const lcRes = await window.electronAPI.settings.get('loyalty.config')
    if (lcRes?.success && lcRes.data) {
      try {
        const parsed = JSON.parse(lcRes.data) as Partial<typeof DEFAULT_LOYALTY>
        setLoyaltyConfig(prev => ({ ...prev, ...parsed }))
      } catch { /* use defaults */ }
    }
    if (tab === 'invoice') {
      const bRes = await window.electronAPI.carBrands.list()
      if (bRes.success && bRes.data) setBrands(bRes.data as CarBrand[])
      void loadPrinters()
    }
    if (tab === 'license') {
      const [statusRes, hwRes] = await Promise.all([
        window.electronAPI.license.getStatus(),
        window.electronAPI.license.getHwId(),
      ])
      if (statusRes.success) setLicStatus(statusRes.data as LicenseStatus)
      if (hwRes.success) setHwId(hwRes.data as string)
    }
    if (tab === 'tv-display') {
      const dRes = await window.electronAPI.tv.listDisplays()
      if (dRes.success && dRes.data) setTvDisplays(dRes.data as TvDisplayOption[])
    }
    if (tab === 'employees') {
      const fmtRes = await window.electronAPI.settings.get('employee.id_format')
      if (fmtRes?.success && fmtRes.data) {
        try {
          const parsed = JSON.parse(fmtRes.data) as Partial<typeof DEFAULT_EMP_ID_FORMAT>
          setEmpIdFormat((prev) => ({ ...prev, ...parsed }))
        } catch {
          /* keep defaults */
        }
      }
    }
    if (tab === 'attendance') {
      const attRes = await window.electronAPI.attendance.getStatuses()
      if (attRes?.success) {
        setAttendanceStatuses(
          (attRes.data ?? []).map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            emoji: s.emoji ?? '',
            is_default: s.is_default,
            is_paid: s.is_paid,
            counts_as_working: s.counts_as_working,
            sort_order: s.sort_order,
          }))
        )
      }
    }
    if (tab === 'store-documents' && canStoreDocuments) {
      const sdRes = await window.electronAPI.storeDocuments.list()
      if (sdRes?.success) setStoreDocs((sdRes.data ?? []) as StoreDocumentRow[])
    }
    if (tab === 'about') {
      try {
        const v = await window.electronAPI.app.getVersion()
        if (v) setAppVersion(String(v))
      } catch { /* ignore */ }
    }
  }

  const loadActivity = useCallback(async (page = 0) => {
    const res = await window.electronAPI.activity.list({
      from: actFromDate || undefined,
      to:   actToDate   || undefined,
      limit: ACTIVITY_PAGE_SIZE,
      offset: page * ACTIVITY_PAGE_SIZE,
    })
    if (res.success) {
      const d = res.data as { rows: ActivityRow[]; total: number }
      setActivityRows(d.rows)
      setActivityTotal(d.total)
      setActivityPage(page)
    }
  }, [actFromDate, actToDate])

  useEffect(() => { load() }, [tab, canStoreDocuments])

  useEffect(() => {
    if (tab === 'store-documents' && !canStoreDocuments) setTab('store')
  }, [tab, canStoreDocuments])
  useEffect(() => {
    if (tab === 'invoice' && (settings['receipt.programming_print_mode'] ?? 'a4_only') === 'a4_or_thermal') {
      void loadPrinters()
    }
  }, [tab, settings['receipt.programming_print_mode']])
  useEffect(() => { if (tab === 'activity') loadActivity(0) }, [tab, loadActivity])

  useEffect(() => {
    if (tab !== 'employees') return
    const parts: string[] = []
    if (empIdFormat.prefix?.trim()) {
      parts.push(empIdFormat.prefix.trim().toUpperCase())
    }
    if (empIdFormat.useYear) {
      parts.push(String(new Date().getFullYear()))
    }
    parts.push('001')
    setEmpIdPreview(parts.join(empIdFormat.separator ?? '-'))
  }, [empIdFormat, tab])

  useEffect(() => {
    void (async () => {
      const res = await window.electronAPI.settings.get('app.shortcuts')
      if (res.success && res.data) {
        try {
          const parsed = JSON.parse(res.data) as Record<string, string>
          setShortcutsState({ ...APP_SHORTCUT_DEFAULTS, ...parsed })
        } catch {
          setShortcutsState({ ...APP_SHORTCUT_DEFAULTS })
        }
      } else {
        setShortcutsState({ ...APP_SHORTCUT_DEFAULTS })
      }
    })()
  }, [])

  const set = (key: string, val: string) => setSettings(s => ({ ...s, [key]: val }))

  const save = async (keys: string[]) => {
    setSaving(true)
    const entries: Record<string, string> = {}
    for (const k of keys) entries[k] = settings[k] ?? ''
    const res = await window.electronAPI.settings.setBulk(entries)
    setSaving(false)
    if (res.success) {
      toast.success(t('common.success'))
      syncCurrency(settings)
    } else toast.error(res.error ?? t('common.error'))
  }

  const saveInvoiceSettings = async (): Promise<void> => {
    setSaving(true)
    const fmt = settings['invoice_number_format'] ?? 'prefix_number'
    const pfxTrim = (settings['invoice_prefix'] ?? '').trim()
    const legacyTrim = (settings['invoice.prefix'] ?? 'INV').trim()
    const prefixCombined = fmt === 'prefix_number' ? (pfxTrim || legacyTrim || 'INV') : pfxTrim
    const entries: Record<string, string> = {
      invoice_number_format: settings['invoice_number_format'] ?? 'prefix_number',
      invoice_prefix: fmt === 'prefix_number' ? prefixCombined : (settings['invoice_prefix'] ?? ''),
      invoice_starting_number: settings['invoice_starting_number'] ?? '1',
      invoice_reset: settings['invoice_reset'] ?? 'never',
      'invoice.next_number': settings['invoice.next_number'] ?? '1',
      'invoice.footer_text': settings['invoice.footer_text'] ?? '',
      'invoice.show_tax': settings['invoice.show_tax'] ?? 'true',
      'invoice.prefix': fmt === 'prefix_number' ? prefixCombined : (settings['invoice.prefix'] ?? 'INV'),
      pdf_download_behavior: settings['pdf_download_behavior'] ?? 'ask',
      pdf_download_folder:   settings['pdf_download_folder']   ?? '',
      'receipt.show_vat':           settings['receipt.show_vat']           ?? 'true',
      'receipt.show_brands':        settings['receipt.show_brands']        ?? 'true',
      'receipt.show_terms':         settings['receipt.show_terms']         ?? 'true',
      'receipt.show_logo':          settings['receipt.show_logo']          ?? 'true',
      'receipt.show_customer_info': settings['receipt.show_customer_info'] ?? 'true',
      'receipt.show_car_info':      settings['receipt.show_car_info']      ?? 'true',
      'receipt.supported_brands':   settings['receipt.supported_brands']   ?? '',
      'receipt.brand_logos':        settings['receipt.brand_logos']        ?? '',
      'receipt.brands_title':       settings['receipt.brands_title']       ?? '',
      'receipt.terms':              settings['receipt.terms']              ?? '',
      'receipt.programming_print_mode': settings['receipt.programming_print_mode'] ?? 'a4_only',
      'printer.name': settings['printer.name'] ?? '',
      'printer.thermal_show_logo': settings['printer.thermal_show_logo'] ?? 'true',
      'printer.thermal_show_customer': settings['printer.thermal_show_customer'] ?? 'true',
      'printer.thermal_show_car': settings['printer.thermal_show_car'] ?? 'true',
      'printer.thermal_show_services': settings['printer.thermal_show_services'] ?? 'true',
      'printer.thermal_show_total': settings['printer.thermal_show_total'] ?? 'true',
      'printer.thermal_show_footer': settings['printer.thermal_show_footer'] ?? 'true',
    }
    const res = await window.electronAPI.settings.setBulk(entries)
    setSaving(false)
    if (res.success) {
      toast.success(t('common.success'))
      await load()
    } else toast.error(res.error ?? t('common.error'))
  }

  const onLogoFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (f.size > MAX_LOGO_BYTES) {
      toast.error('Image is too large (max ~1.5 MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result
      if (typeof data === 'string') setSettings(s => ({ ...s, store_logo: data }))
    }
    reader.readAsDataURL(f)
  }

  const saveBranding = async () => {
    setSaving(true)
    const appName    = settings['app.name']    ?? 'Mahali Garage'
    const appTagline = settings['app.tagline'] ?? ''
    const res = await window.electronAPI.settings.setBulk({ 'app.name': appName, 'app.tagline': appTagline })
    setSaving(false)
    if (res.success) {
      setBranding(appName, appTagline || `Welcome to ${appName}`)
      toast.success(t('common.success'))
    } else {
      toast.error(res.error ?? t('common.error'))
    }
  }

  const handleActivate = async () => {
    if (!licKey.trim()) { toast.error('Enter a license key'); return }
    setActivating(true)
    const res = await window.electronAPI.license.activate(licKey.trim())
    setActivating(false)
    if (res.success) {
      const result = res.data as { success: boolean; error?: string }
      if (result.success) { toast.success('License activated!'); load() }
      else toast.error(result.error ?? 'Activation failed')
    } else toast.error(res.error ?? t('common.error'))
  }

  const TABS: Array<{ key: Tab; label: string; guard?: boolean; ownerOrManagerOnly?: boolean }> = [
    { key: 'store',      label: t('settings.storeInfo'), guard: canSettings },
    { key: 'invoice',    label: t('settings.invoice'),   guard: canSettings },
    { key: 'tax',        label: t('settings.tax'),       guard: canSettings },
    { key: 'appearance', label: t('settings.appearance') },
    { key: 'shortcuts', label: 'Shortcuts', guard: canSettings },
    { key: 'loyalty', label: 'Loyalty' },
    { key: 'payment',    label: t('settings.paymentMethods'), guard: canSettings },
    { key: 'job-types',  label: t('settings.jobTypes', { defaultValue: 'Job Types' }), guard: canSettings },
    { key: 'car-brands', label: t('settings.carBrands', { defaultValue: 'Car Brands' }), guard: canSettings },
    { key: 'dashboard',  label: 'Dashboard', guard: canSettings },
    { key: 'tv-display', label: t('settings.tvDisplay', { defaultValue: 'TV Display' }), guard: canSettings },
    { key: 'payroll',    label: t('settings.payroll', { defaultValue: 'Payroll' }), guard: canSettings },
    { key: 'backup',     label: t('settings.backup'),         guard: canBackup },
    { key: 'activity',   label: t('settings.activityLog'),    guard: canActivityLog },
    { key: 'license',    label: 'License' },
    { key: 'employees', label: 'Employees' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'store-documents', label: 'Store Documents', ownerOrManagerOnly: true },
    { key: 'about', label: 'About' },
  ]

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1 text-foreground'
  const saveBtnCls = 'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60'
  const dashboardWidgets = parseDashboardWidgets(settings['dashboard_widgets'])
  const tvDisplayWidgets = parseTvDisplayWidgets(settings['tv_display_widgets'])

  const parseBrandLogos = (raw: string | undefined): string[] => {
    try {
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : []
    } catch {
      return []
    }
  }

  const brandLogos: string[] = parseBrandLogos(settings['receipt.brand_logos']).slice(0, 5)

  const setBrandLogos = (logos: string[]): void => {
    set('receipt.brand_logos', JSON.stringify(logos.slice(0, 5)))
  }

  const logoFileInputRef = useRef<HTMLInputElement>(null)

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      if (!result.startsWith('data:image/')) return
      setSettings(s => {
        const current = parseBrandLogos(s['receipt.brand_logos'])
        if (current.length >= 5) return s
        return { ...s, 'receipt.brand_logos': JSON.stringify([...current, result].slice(0, 5)) }
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeLogoAt = (index: number): void => {
    setBrandLogos(brandLogos.filter((_, i) => i !== index))
  }

  const toggleDashboardWidget = (widgetId: string): void => {
    const next = { ...dashboardWidgets, [widgetId]: !dashboardWidgets[widgetId as keyof typeof dashboardWidgets] }
    set('dashboard_widgets', JSON.stringify(next))
  }

  const toggleTvDisplayWidget = (widgetId: string): void => {
    if (widgetId === 'current_time_date') return
    const next = { ...tvDisplayWidgets, [widgetId]: !tvDisplayWidgets[widgetId as keyof typeof tvDisplayWidgets] }
    next.current_time_date = true
    set('tv_display_widgets', JSON.stringify(next))
  }

  async function saveLoyalty(): Promise<void> {
    setLoyaltySaving(true)
    try {
      await window.electronAPI.settings.set(
        'loyalty.config',
        JSON.stringify(loyaltyConfig)
      )
      toast.success('Loyalty settings saved')
    } catch {
      toast.error('Failed to save loyalty settings')
    } finally {
      setLoyaltySaving(false)
    }
  }

  async function saveEmpIdFormat(): Promise<void> {
    setEmpIdSaving(true)
    try {
      const res = await window.electronAPI.settings.set('employee.id_format', JSON.stringify(empIdFormat))
      if (!res.success) {
        toast.error(res.error ?? 'Failed to save')
        return
      }
      toast.success('Employee ID format saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setEmpIdSaving(false)
    }
  }

  async function checkForUpdates(): Promise<void> {
    setDownloadState({
      downloading: false,
      progress: 0,
      filePath: null,
      error: null,
      done: false,
    })
    setUpdateStatus(prev => ({
      ...prev,
      checking: true,
      checked: false,
      error: undefined,
    }))
    try {
      const res = await window.electronAPI.app.checkForUpdates()
      if (res?.data) {
        setUpdateStatus({
          checking: false,
          checked: true,
          hasUpdate: res.data.hasUpdate ?? false,
          latestVersion: res.data.latestVersion,
          releaseName: res.data.releaseName,
          releaseUrl: res.data.releaseUrl,
          publishedAt: res.data.publishedAt,
          releaseNotes: res.data.releaseNotes,
          error: res.data.error,
          downloadUrl: res.data.downloadUrl,
          downloadSize: res.data.downloadSize,
        })
      }
    } catch {
      setUpdateStatus({
        checking: false,
        checked: true,
        hasUpdate: false,
        error: 'Failed to check for updates',
      })
    }
  }

  async function handleDownloadUpdate(): Promise<void> {
    if (!updateStatus.downloadUrl) return

    setDownloadState({
      downloading: true,
      progress: 0,
      filePath: null,
      error: null,
      done: false,
    })

    const cleanup = window.electronAPI.app.onDownloadProgress(({ progress }) => {
      setDownloadState(prev => ({
        ...prev,
        progress: progress === -1 ? prev.progress : progress,
      }))
    })

    try {
      const res = await window.electronAPI.app.downloadUpdate(updateStatus.downloadUrl)

      cleanup()

      if (res?.success && res.data) {
        setDownloadState({
          downloading: false,
          progress: 100,
          filePath: res.data.filePath,
          error: null,
          done: true,
        })
        toast.success('Download complete! Click Install to update.')
      } else {
        setDownloadState(prev => ({
          ...prev,
          downloading: false,
          error: res?.error ?? 'Download failed',
        }))
      }
    } catch {
      cleanup()
      setDownloadState(prev => ({
        ...prev,
        downloading: false,
        error: 'Download failed',
      }))
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    if (!downloadState.filePath) return
    await window.electronAPI.app.installUpdate(downloadState.filePath)
  }

  async function saveStatus(): Promise<void> {
    if (!statusForm.name.trim()) return
    setStatusSaving(true)
    const wasEdit = editingStatusId != null
    try {
      const payload = {
        name: statusForm.name.trim(),
        color: statusForm.color,
        emoji: statusForm.emoji || undefined,
        is_paid: statusForm.is_paid,
        counts_as_working: statusForm.counts_as_working,
      }
      const saveRes =
        editingStatusId != null
          ? await window.electronAPI.attendance.updateStatus(editingStatusId, payload)
          : await window.electronAPI.attendance.createStatus(payload)
      if (!saveRes.success) {
        toast.error(saveRes.error ?? 'Failed to save status')
        return
      }
      const res = await window.electronAPI.attendance.getStatuses()
      if (res?.success) {
        setAttendanceStatuses(
          (res.data ?? []).map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            emoji: s.emoji ?? '',
            is_default: s.is_default,
            is_paid: s.is_paid,
            counts_as_working: s.counts_as_working,
            sort_order: s.sort_order,
          }))
        )
      }
      setShowStatusForm(false)
      setEditingStatusId(null)
      setStatusForm({
        name: '',
        color: '#6b7280',
        emoji: '',
        is_paid: 1,
        counts_as_working: 0,
      })
      toast.success(wasEdit ? 'Status updated' : 'Status added')
    } catch {
      toast.error('Failed to save status')
    } finally {
      setStatusSaving(false)
    }
  }

  async function deleteStatus(id: number, isDefault: number): Promise<void> {
    if (isDefault) {
      toast.error('Cannot delete default statuses')
      return
    }
    try {
      const delRes = await window.electronAPI.attendance.deleteStatus(id)
      if (!delRes.success) {
        toast.error(delRes.error ?? 'Failed to delete status')
        return
      }
      setAttendanceStatuses(prev => prev.filter(s => s.id !== id))
      toast.success('Status deleted')
    } catch {
      toast.error('Failed to delete status')
    }
  }

  async function pickStoreDocFile(): Promise<void> {
    const res = await window.electronAPI.employees.chooseFile()
    if (res?.success && res.data) {
      setStoreDocFile({
        name: res.data.fileName,
        data: fileBufferToBase64(res.data.fileBuffer),
        size: res.data.fileSize,
      })
    }
  }

  async function uploadStoreDoc(): Promise<void> {
    if (!storeDocFile || !storeDocForm.name.trim()) return
    setStoreDocSaving(true)
    try {
      const res = await window.electronAPI.storeDocuments.upload({
        name: storeDocForm.name.trim(),
        doc_type: storeDocForm.doc_type,
        file_name: storeDocFile.name,
        file_data: storeDocFile.data,
        has_expiry: storeDocForm.has_expiry,
        expiry_date:
          storeDocForm.has_expiry && storeDocForm.expiry_date ? storeDocForm.expiry_date : undefined,
        notes: storeDocForm.notes || undefined,
      })
      if (!res.success) {
        toast.error(res.error ?? 'Failed to upload document')
        return
      }
      toast.success('Document uploaded')
      setShowStoreDocForm(false)
      setStoreDocFile(null)
      setStoreDocForm({
        name: '',
        doc_type: 'trade_license',
        has_expiry: 1,
        expiry_date: '',
        notes: '',
      })
      const list = await window.electronAPI.storeDocuments.list()
      if (list?.success) setStoreDocs((list.data ?? []) as StoreDocumentRow[])
    } catch {
      toast.error('Failed to upload document')
    } finally {
      setStoreDocSaving(false)
    }
  }

  async function deleteStoreDoc(id: number): Promise<void> {
    try {
      const res = await window.electronAPI.storeDocuments.delete(id)
      if (!res.success) {
        toast.error(res.error ?? 'Failed to delete document')
        return
      }
      setStoreDocs(prev => prev.filter(d => d.id !== id))
      toast.success('Document deleted')
    } catch {
      toast.error('Failed to delete document')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('settings.title')}</h1>

      <div className="flex gap-1 border-b border-border mb-6 flex-wrap">
        {TABS.filter(tb => !tb.ownerOrManagerOnly || canStoreDocuments).map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tb.key === 'shortcuts' ? <Keyboard className="w-4 h-4 shrink-0" /> : null}
            {tb.label}
          </button>
        ))}
      </div>

      <div className={`bg-card border border-border rounded-xl p-6 ${tab === 'car-brands' || tab === 'invoice' ? 'max-w-3xl' : tab === 'about' ? 'max-w-md' : 'max-w-2xl'}`}>

        {tab === 'store' && (
          <div className="space-y-4">

            {/* ── App Branding ── */}
            <div className="pb-4 mb-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">App Branding</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>App Name <span className="text-muted-foreground font-normal">(shown in sidebar &amp; login title)</span></label>
                  <input
                    value={settings['app.name'] ?? 'Mahali Garage'}
                    onChange={e => set('app.name', e.target.value)}
                    placeholder="Mahali Garage"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Login Tagline <span className="text-muted-foreground font-normal">(subtitle on login)</span></label>
                  <input
                    value={settings['app.tagline'] ?? ''}
                    onChange={e => set('app.tagline', e.target.value)}
                    placeholder={`Welcome to ${settings['app.name'] ?? 'Mahali Garage'}`}
                    className={inputCls}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty to auto-generate from App Name.</p>
                </div>
                <button onClick={saveBranding} disabled={saving} className={saveBtnCls}>
                  {saving ? t('common.loading') : 'Save Branding'}
                </button>
              </div>
            </div>

            {/* ── Store Info ── */}
            <h3 className="text-sm font-semibold text-foreground">Store Information</h3>
            <div>
              <label className={labelCls}>Garage logo</label>
              <div className="flex flex-wrap items-start gap-4 mt-1">
                {settings['store_logo'] ? (
                  <img
                    src={settings['store_logo']}
                    alt="Garage logo preview"
                    className="h-24 w-auto max-w-[220px] object-contain rounded-lg border border-border bg-muted/30 p-2"
                  />
                ) : (
                  <div className="h-24 w-40 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground bg-muted/20">
                    No logo
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md bg-background cursor-pointer hover:bg-muted/60 w-fit">
                    <Upload className="w-4 h-4" />
                    Upload image
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
                  </label>
                  {!!settings['store_logo'] && (
                    <button
                      type="button"
                      onClick={() => set('store_logo', '')}
                      className="text-sm text-destructive hover:underline text-start"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div><label className={labelCls}>{t('settings.storeName')}</label><input value={settings['store.name'] ?? ''} onChange={e => set('store.name', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('settings.storeAddress')}</label><input value={settings['store.address'] ?? ''} onChange={e => set('store.address', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('settings.storePhone')}</label><input value={settings['store.phone'] ?? ''} onChange={e => set('store.phone', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('settings.storeEmail')}</label><input value={settings['store.email'] ?? ''} onChange={e => set('store.email', e.target.value)} className={inputCls} /></div>
            <div className="flex gap-3">
              <div className="flex-1"><label className={labelCls}>{t('settings.currency')}</label><input value={settings['store.currency'] ?? 'AED'} onChange={e => set('store.currency', e.target.value)} className={inputCls} /></div>
              <div className="w-28"><label className={labelCls}>Symbol</label><input value={settings['store.currency_symbol'] ?? 'د.إ'} onChange={e => set('store.currency_symbol', e.target.value)} className={inputCls} /></div>
            </div>
            <button
              onClick={() => save(['store.name','store.address','store.phone','store.email','store.currency','store.currency_symbol','store_logo'])}
              disabled={saving}
              className={saveBtnCls}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Invoice number format</label>
              <select
                value={settings['invoice_number_format'] ?? 'prefix_number'}
                onChange={e => set('invoice_number_format', e.target.value)}
                className={inputCls}
              >
                <option value="prefix_number">Prefix + number</option>
                <option value="number_only">Number only</option>
              </select>
            </div>
            {(settings['invoice_number_format'] ?? 'prefix_number') === 'prefix_number' && (
              <div>
                <label className={labelCls}>Prefix</label>
                <input
                  value={
                    (settings['invoice_prefix'] !== undefined && settings['invoice_prefix'] !== '')
                      ? settings['invoice_prefix']
                      : (settings['invoice.prefix'] ?? 'INV')
                  }
                  onChange={e => set('invoice_prefix', e.target.value)}
                  placeholder="e.g. INV"
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Starting number (after yearly / monthly reset)</label>
              <input
                type="number"
                min={1}
                value={settings['invoice_starting_number'] ?? '1'}
                onChange={e => set('invoice_starting_number', e.target.value)}
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">Used when the period changes and reset is Yearly or Monthly.</p>
            </div>
            <div>
              <label className={labelCls}>Reset sequence</label>
              <select
                value={settings['invoice_reset'] ?? 'never'}
                onChange={e => set('invoice_reset', e.target.value)}
                className={inputCls}
              >
                <option value="never">Never</option>
                <option value="yearly">Yearly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Next invoice # (current sequence)</label>
              <input
                type="number"
                min={1}
                value={settings['invoice.next_number'] ?? '1'}
                onChange={e => set('invoice.next_number', e.target.value)}
                className={inputCls}
              />
            </div>
            <div><label className={labelCls}>{t('settings.invoiceFooter')}</label><textarea value={settings['invoice.footer_text'] ?? ''} onChange={e => set('invoice.footer_text', e.target.value)} rows={3} className={inputCls} /></div>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings['invoice.show_tax'] === 'true'} onChange={e => set('invoice.show_tax', String(e.target.checked))} className="w-4 h-4" /><span className="text-sm">Show Tax on Invoice</span></label>

            {/* ── PDF Download Behavior ── */}
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">PDF Download Behavior</h3>
              <div className="space-y-2">
                {([
                  ['ask',      'Ask me each time (show save dialog)'],
                  ['download', 'Download directly to a folder'],
                  ['none',     "Don't download — open in PDF viewer only"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pdf_download_behavior"
                      className="w-4 h-4"
                      checked={(settings['pdf_download_behavior'] ?? 'ask') === value}
                      onChange={() => set('pdf_download_behavior', value)}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
              {settings['pdf_download_behavior'] === 'download' && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    className={`${inputCls} flex-1`}
                    value={settings['pdf_download_folder'] ?? ''}
                    placeholder="No folder selected…"
                  />
                  <button
                    type="button"
                    onClick={() => void window.electronAPI.print.chooseDownloadFolder().then(res => {
                      if (res.success && res.data) set('pdf_download_folder', res.data as string)
                    })}
                    className="px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-muted/60 whitespace-nowrap"
                  >
                    Choose Folder
                  </button>
                </div>
              )}
            </div>

            {/* ── Print Sections ── */}
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">Print Sections</h3>
              <div className="space-y-2">
                {([
                  ['receipt.show_vat',           'true', 'Show VAT on receipt'],
                  ['receipt.show_brands',         'true', 'Show "We Work with" brands section'],
                  ['receipt.show_terms',          'true', 'Show "Our terms" footer'],
                  ['receipt.show_logo',           'true', 'Show garage logo on receipt'],
                  ['receipt.show_customer_info',  'true', 'Show customer info on receipt'],
                  ['receipt.show_car_info',       'true', 'Show car info on receipt'],
                ] as const).map(([key, def, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={(settings[key] ?? def) === 'true'}
                      onChange={() => set(key, (settings[key] ?? def) === 'true' ? 'false' : 'true')}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── We Work With — Logos ── */}
            <div className="pt-2 border-t border-border">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">We Work With — Logos</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload up to 5 logos to show in the &quot;We Work with&quot; section on printed receipts.
                </p>
                <div className="mb-3">
                  <label className={labelCls}>Section Title</label>
                  <input
                    type="text"
                    value={settings['receipt.brands_title'] ?? 'We Work with'}
                    onChange={e => set('receipt.brands_title', e.target.value)}
                    placeholder="We Work with"
                    className={inputCls}
                  />
                </div>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFile}
                />
                <div className="flex flex-wrap gap-2 items-start">
                  {brandLogos.map((logo, index) => (
                    <div
                      key={index}
                      className="relative w-20 h-20 shrink-0 rounded-lg border border-border bg-background overflow-hidden"
                    >
                      <img src={logo} alt="" className="w-full h-full object-contain p-1" />
                      <button
                        type="button"
                        onClick={() => removeLogoAt(index)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-background/90 text-red-600 hover:bg-destructive/10"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {brandLogos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      className="w-20 h-20 shrink-0 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                    >
                      <Plus className="w-7 h-7" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {brandLogos.length}/5 logos added
                </p>
              </div>
            </div>

            {/* ── Custom Terms Text ── */}
            <div className="pt-2 border-t border-border">
              <label className="block text-sm font-semibold text-foreground mb-1">Custom Terms Text</label>
              <textarea
                rows={4}
                className={inputCls}
                value={settings['receipt.terms'] ?? ''}
                onChange={e => set('receipt.terms', e.target.value)}
                placeholder="Thank you for your business!"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown in the "Our terms" footer of the printed receipt.
              </p>
            </div>

            {/* ── Print Mode for Programming Receipts ── */}
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Print Mode for Programming Receipts
              </h3>
              <div className="space-y-2">
                {([
                  ['a4_only',       'A4 only'],
                  ['a4_or_thermal', 'A4 or Thermal'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="programming_print_mode"
                      className="w-4 h-4"
                      checked={(settings['receipt.programming_print_mode'] ?? 'a4_only') === value}
                      onChange={() => set('receipt.programming_print_mode', value)}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {(settings['receipt.programming_print_mode'] ?? 'a4_only') === 'a4_or_thermal' && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Thermal Printer
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={settings['printer.name'] ?? ''}
                      onChange={e => set('printer.name', e.target.value)}
                      className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option value="">— Select printer —</option>
                      {printerList.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.displayName}
                          {p.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void loadPrinters()}
                      className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted/50"
                    >
                      Refresh
                    </button>
                  </div>
                  {settings['printer.name'] && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Selected: {settings['printer.name']}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">
                    Thermal Receipt Content
                  </label>
                  {([
                    ['printer.thermal_show_logo', 'Show store logo'],
                    ['printer.thermal_show_customer', 'Show customer name'],
                    ['printer.thermal_show_car', 'Show car info'],
                    ['printer.thermal_show_services', 'Show services list'],
                    ['printer.thermal_show_total', 'Show total amount'],
                    ['printer.thermal_show_footer', 'Show footer/terms'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer mb-1">
                      <input
                        type="checkbox"
                        checked={(settings[key] ?? 'true') !== 'false'}
                        onChange={e => set(key, e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button type="button" onClick={() => void saveInvoiceSettings()} disabled={saving} className={saveBtnCls}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}

        {tab === 'tax' && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings['tax.enabled'] === 'true'} onChange={e => set('tax.enabled', String(e.target.checked))} className="w-4 h-4" /><span className="text-sm font-medium">Enable Tax</span></label>
            <div><label className={labelCls}>Tax Name</label><input value={settings['tax.name'] ?? 'Tax'} onChange={e => set('tax.name', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Tax Rate (%)</label><input type="number" min="0" max="100" step="0.01" value={settings['tax.rate'] ?? '0'} onChange={e => set('tax.rate', e.target.value)} className={inputCls} /></div>
            <button onClick={() => save(['tax.enabled','tax.name','tax.rate'])} disabled={saving} className={saveBtnCls}>{saving ? t('common.loading') : t('common.save')}</button>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>{t('settings.theme')}</label>
              <div className="flex gap-3 mt-1">
                {(['light','dark','system'] as const).map(th => (
                  <button key={th} onClick={() => setTheme(th)}
                    className={`px-4 py-2 text-sm rounded-md border-2 capitalize font-medium transition-colors ${theme === th ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}>
                    {th}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('settings.language')}</label>
              <div className="flex gap-3 mt-1">
                {([['en', 'English'], ['ar', 'العربية']] as const).map(([code, label]) => (
                  <button key={code} onClick={() => setLang(code)}
                    className={`px-4 py-2 text-sm rounded-md border-2 font-medium transition-colors ${lang === code ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'payment' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select which payment methods to offer at checkout.</p>
            <div className="space-y-2">
              {(['cash','card','transfer','mobile','other'] as const).map(method => {
                const methods: string[] = (() => { try { return JSON.parse(settings['payment_methods'] ?? '[]') } catch { return [] } })()
                const enabled = methods.includes(method)
                const toggle = () => {
                  const next = enabled ? methods.filter(m => m !== method) : [...methods, method]
                  set('payment_methods', JSON.stringify(next))
                }
                return (
                  <label key={method} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={toggle} className="w-4 h-4" />
                    <span className="text-sm capitalize">{method.replace('_', ' ')}</span>
                  </label>
                )
              })}
            </div>
            <button onClick={() => save(['payment_methods'])} disabled={saving} className={saveBtnCls}>{saving ? t('common.loading') : t('common.save')}</button>
          </div>
        )}

        {tab === 'payroll' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{t('settings.payrollNotifications', { defaultValue: 'Payroll notifications' })}</h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.payrollNotificationsHint', { defaultValue: 'Remind owners in the app when a salary is due within the selected number of days.' })}
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border"
                checked={(settings['payroll.reminders_enabled'] ?? '1') === '1'}
                onChange={e => set('payroll.reminders_enabled', e.target.checked ? '1' : '0')}
              />
              <span className="text-sm text-foreground">{t('settings.payrollRemindersEnable', { defaultValue: 'Enable salary reminders' })}</span>
            </label>
            <div>
              <label className={labelCls}>{t('settings.payrollRemindersDays', { defaultValue: 'Days before payday to notify' })}</label>
              <input
                type="number"
                min={0}
                max={60}
                className={inputCls}
                value={settings['payroll.reminder_days_before'] ?? '2'}
                onChange={e => set('payroll.reminder_days_before', e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => save(['payroll.reminders_enabled', 'payroll.reminder_days_before'])}
              disabled={saving}
              className={saveBtnCls}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}

        {tab === 'shortcuts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Customize keyboard shortcuts for quick actions.
                Use format: ctrl+shift+s, alt+t, etc.
              </p>
            </div>
            <div className="space-y-3">
              {([
                ['smart_recipe', 'Create Smart Recipe'],
                ['custom_recipe', 'Create Custom Recipe'],
                ['tv_on', 'TV Display ON'],
                ['tv_off', 'TV Display OFF'],
                ['add_customer', 'Add New Customer'],
                ['add_vehicle', 'Add New Vehicle'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                  <span className="text-sm text-foreground shrink-0">{label}</span>
                  <input
                    type="text"
                    value={shortcutsState[key] ?? ''}
                    onChange={e => setShortcutsState(s => ({ ...s, [key]: e.target.value }))}
                    className={`${inputCls} sm:max-w-xs sm:flex-1`}
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  setSaving(true)
                  const res = await window.electronAPI.settings.set('app.shortcuts', JSON.stringify(shortcutsState))
                  setSaving(false)
                  if (res.success) {
                    toast.success(t('common.success'))
                    setSettings(s => ({ ...s, 'app.shortcuts': JSON.stringify(shortcutsState) }))
                  } else toast.error(res.error ?? t('common.error'))
                }}
                disabled={saving}
                className={saveBtnCls}
              >
                {saving ? t('common.loading') : t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => setShortcutsState({ ...APP_SHORTCUT_DEFAULTS })}
                disabled={saving}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-60"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {tab === 'loyalty' && (
          <div className="space-y-6 max-w-2xl">

            {/* Enable toggle */}
            <div className="flex items-center
      justify-between p-4 border border-border
      rounded-lg">
              <div>
                <p className="font-medium text-sm">
                  Loyalty Program
                </p>
                <p className="text-xs text-muted-foreground">
                  Reward customers for their visits
                </p>
              </div>
              <input type="checkbox"
                checked={loyaltyConfig.enabled}
                onChange={e =>
                  setLC('enabled', e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
            </div>

            {loyaltyConfig.enabled && (<>

              {/* Department Mode */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Department Tracking
                </p>
                <div className="space-y-2">
                  {([
                    ['combined',
                      'Combined — one balance for all departments'],
                    ['per_dept',
                      'Per Department — separate Mechanical and Programming balances'],
                  ] as const).map(([val, label]) => (
                    <label key={val}
                      className="flex items-center gap-2
              text-sm cursor-pointer">
                      <input type="radio"
                        name="deptMode"
                        value={val}
                        checked={loyaltyConfig.deptMode === val}
                        onChange={() => setLC('deptMode', val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Program Type */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Program Type
                </p>
                <div className="space-y-2">
                  {([
                    ['points', 'Points per AED spent'],
                    ['stamps', 'Stamp Card'],
                    ['tiers', 'Discount Tiers'],
                    ['all', 'All Combined'],
                  ] as const).map(([val, label]) => (
                    <label key={val}
                      className="flex items-center gap-2
              text-sm cursor-pointer">
                      <input type="radio"
                        name="loyaltyType"
                        value={val}
                        checked={loyaltyConfig.type === val}
                        onChange={() => setLC('type', val)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Points Settings */}
              {(loyaltyConfig.type === 'points' ||
                loyaltyConfig.type === 'all') && (
                <div className="space-y-3 p-4 border
          border-border rounded-lg">
                  <p className="text-sm font-semibold">
                    Points Settings
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs
                text-muted-foreground mb-1 block">
                        Points per AED
                      </label>
                      <input type="number" min="0.1"
                        step="0.1"
                        value={loyaltyConfig.pointsPerAed}
                        onChange={e => setLC('pointsPerAed',
                          parseFloat(e.target.value) || 1)}
                        className="w-full border border-border
                  rounded-md px-3 py-1.5 text-sm
                  bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-xs
                text-muted-foreground mb-1 block">
                        Points label
                      </label>
                      <input type="text"
                        value={loyaltyConfig.pointsLabel}
                        onChange={e =>
                          setLC('pointsLabel', e.target.value)}
                        className="w-full border border-border
                  rounded-md px-3 py-1.5 text-sm
                  bg-background"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Stamp Settings */}
              {(loyaltyConfig.type === 'stamps' ||
                loyaltyConfig.type === 'all') && (
                <div className="space-y-3 p-4 border
          border-border rounded-lg">
                  <p className="text-sm font-semibold">
                    Stamp Card Settings
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs
                text-muted-foreground mb-1 block">
                        Stamps per visit
                      </label>
                      <input type="number" min="1"
                        value={loyaltyConfig.stampsPerVisit}
                        onChange={e => setLC('stampsPerVisit',
                          parseInt(e.target.value, 10) || 1)}
                        className="w-full border border-border
                  rounded-md px-3 py-1.5 text-sm
                  bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-xs
                text-muted-foreground mb-1 block">
                        Stamps for reward
                      </label>
                      <input type="number" min="1"
                        value={loyaltyConfig.stampsForReward}
                        onChange={e => setLC('stampsForReward',
                          parseInt(e.target.value, 10) || 10)}
                        className="w-full border border-border
                  rounded-md px-3 py-1.5 text-sm
                  bg-background"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs
              text-muted-foreground mb-1 block">
                      Reward description
                    </label>
                    <input type="text"
                      value={loyaltyConfig.stampRewardDesc}
                      onChange={e =>
                        setLC('stampRewardDesc', e.target.value)}
                      className="w-full border border-border
                rounded-md px-3 py-1.5 text-sm
                bg-background"
                    />
                  </div>
                </div>
              )}

              {/* Discount Tiers */}
              {(loyaltyConfig.type === 'tiers' ||
                loyaltyConfig.type === 'all') && (
                <div className="space-y-3 p-4 border
          border-border rounded-lg">
                  <p className="text-sm font-semibold">
                    Discount Tiers
                  </p>
                  {([
                    ['tier1Visits', 'tier1Discount', 'Tier 1'],
                    ['tier2Visits', 'tier2Discount', 'Tier 2'],
                    ['tier3Visits', 'tier3Discount', 'Tier 3'],
                  ] as const).map(([vKey, dKey, label]) => (
                    <div key={label}
                      className="flex items-center gap-2
              text-sm">
                      <span className="w-12 shrink-0
                font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        After
                      </span>
                      <input type="number" min="1"
                        value={loyaltyConfig[vKey]}
                        onChange={e => setLC(vKey,
                          parseInt(e.target.value, 10) || 1)}
                        className="w-16 border border-border
                  rounded-md px-2 py-1 text-sm
                  bg-background text-center"
                      />
                      <span className="text-muted-foreground">
                        visits →
                      </span>
                      <input type="number" min="1" max="100"
                        value={loyaltyConfig[dKey]}
                        onChange={e => setLC(dKey,
                          parseInt(e.target.value, 10) || 1)}
                        className="w-16 border border-border
                  rounded-md px-2 py-1 text-sm
                  bg-background text-center"
                      />
                      <span className="text-muted-foreground">
                        % off
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Earning Method */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Earning Method
                </p>
                {([
                  ['autoEarnInvoice',
                    'Automatically on every invoice'],
                  ['autoEarnReceipt',
                    'Automatically on every receipt'],
                  ['allowManualAdjust',
                    'Allow manual adjustment by staff'],
                ] as const).map(([key, label]) => (
                  <label key={key}
                    className="flex items-center gap-2
            text-sm cursor-pointer">
                    <input type="checkbox"
                      checked={loyaltyConfig[key]}
                      onChange={e =>
                        setLC(key, e.target.checked)}
                      className="w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Visibility
                </p>
                {([
                  ['showInProfile', 'Customer profile'],
                  ['showOnReceipt', 'Printed receipts'],
                ] as const).map(([key, label]) => (
                  <label key={key}
                    className="flex items-center gap-2
            text-sm cursor-pointer">
                    <input type="checkbox"
                      checked={loyaltyConfig[key]}
                      onChange={e =>
                        setLC(key, e.target.checked)}
                      className="w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>

            </>)}

            {/* Save */}
            <button
              type="button"
              onClick={() => void saveLoyalty()}
              disabled={loyaltySaving}
              className="px-4 py-2 bg-primary
        text-primary-foreground rounded-md
        text-sm font-medium hover:bg-primary/90
        disabled:opacity-50">
              {loyaltySaving ? 'Saving...' : 'Save'}
            </button>

          </div>
        )}

        {tab === 'dashboard' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which widgets are visible on the Dashboard.
            </p>
            <div className="space-y-2">
              {DASHBOARD_WIDGETS.map((widget) => (
                <label key={widget.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                  <span className="text-sm text-foreground">{widget.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleDashboardWidget(widget.id)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${dashboardWidgets[widget.id] ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${dashboardWidgets[widget.id] ? 'translate-x-5' : ''}`} />
                  </button>
                </label>
              ))}
            </div>
            <button onClick={() => save(['dashboard_widgets'])} disabled={saving} className={saveBtnCls}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}

        {tab === 'tv-display' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t('settings.tvDisplayScreen', { defaultValue: 'TV Display Screen' })}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.tvDisplayScreenHint', { defaultValue: 'Choose which connected display to use when opening TV Display mode.' })}
              </p>
            </div>
            <div>
              <label className={labelCls}>{t('settings.tvDisplayScreen', { defaultValue: 'TV Display Screen' })}</label>
              <select
                className={inputCls}
                value={settings['tv_display_screen'] ?? ''}
                onChange={e => set('tv_display_screen', e.target.value)}
              >
                <option value="">
                  {t('settings.tvDisplayAuto', { defaultValue: 'Auto (Secondary display, or primary if only one)' })}
                </option>
                {tvDisplays.map(d => (
                  <option key={d.id} value={String(d.index)}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t('settings.tvDisplayWidgets', { defaultValue: 'TV Display Widgets' })}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t('settings.tvDisplayWidgetsHint', { defaultValue: 'Choose which widgets are visible on the TV display.' })}
              </p>
              <div className="space-y-2">
                {TV_DISPLAY_WIDGETS.map((widget) => {
                  const locked = widget.id === 'current_time_date'
                  return (
                    <label key={widget.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
                      <span className="text-sm text-foreground">{widget.label}</span>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => toggleTvDisplayWidget(widget.id)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${tvDisplayWidgets[widget.id] ? 'bg-primary' : 'bg-muted-foreground/30'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        title={locked ? t('settings.tvDisplayWidgetAlwaysOn', { defaultValue: 'Always shown' }) : undefined}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${tvDisplayWidgets[widget.id] ? 'translate-x-5' : ''}`} />
                      </button>
                    </label>
                  )
                })}
              </div>
            </div>
            <button onClick={() => save(['tv_display_screen', 'tv_display_widgets'])} disabled={saving} className={saveBtnCls}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}

        {tab === 'backup' && (
          <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>}>
            <BackupSettingsTab />
          </Suspense>
        )}

        {tab === 'job-types' && (
          <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>}>
            <JobTypesSettings />
          </Suspense>
        )}

        {tab === 'car-brands' && (
          <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>}>
            <CarBrandsSettings />
          </Suspense>
        )}

        {tab === 'license' && (
          <div className="space-y-6">
            {/* Status */}
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${licStatus?.licensed ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-muted/50 border-border'}`}>
              {licStatus?.licensed
                ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                : <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              }
              <div>
                <p className="text-sm font-medium">{licStatus?.licensed ? 'Licensed' : 'Unlicensed (Demo Mode)'}</p>
                {licStatus?.gracePeriod && <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Hardware changed — grace period until {licStatus.graceUntil?.slice(0, 10)}</p>}
                {licStatus?.reason && <p className="text-xs text-destructive mt-0.5">{licStatus.reason}</p>}
              </div>
            </div>

            {/* License information card */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">License Information</h3>

              {/* Device ID */}
              <div>
                <label className={labelCls}>Device ID</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 bg-muted rounded font-mono text-xs overflow-x-auto">
                    {hwId || '—'}
                  </code>
                  <button
                    type="button"
                    onClick={() => { if (hwId) { navigator.clipboard.writeText(hwId); toast.success('Copied!') } }}
                    className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Share this Device ID with support if you need help or a new license.</p>
              </div>

              {/* License Type */}
              <div>
                <label className={labelCls}>License Type</label>
                <div className="mt-1">
                  {(() => {
                    const t = licStatus?.type || ''
                    let tier: 'Trial' | 'Standard' | 'Premium' | 'Basic' | 'Unknown' = 'Unknown'
                    if (t.includes('PREMIUM')) tier = 'Premium'
                    else if (t.includes('STANDARD')) tier = 'Standard'
                    else if (t.includes('BASIC')) tier = 'Basic'
                    else if (t.includes('TRIAL')) tier = 'Trial'
                    return (
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          tier === 'Premium'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : tier === 'Standard'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : tier === 'Trial'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        }`}
                      >
                        {tier}
                      </span>
                    )
                  })()}
                </div>
              </div>

              {/* Duration & Expiry */}
              <div>
                <label className={labelCls}>Duration</label>
                <div className="mt-1 space-y-1">
                  {licStatus?.expiresAt === null || licStatus?.expiresAt === 0 ? (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      Lifetime License
                    </span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {licStatus?.daysRemaining != null && licStatus.daysRemaining >= 0 ? (
                          <>
                            <span className="text-xs font-medium">
                              {licStatus.daysRemaining} day{licStatus.daysRemaining === 1 ? '' : 's'} remaining
                            </span>
                            {licStatus.daysRemaining < 7 && (
                              <span className="text-[10px] text-orange-600 dark:text-orange-400">
                                Renew soon
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            Expired
                          </span>
                        )}
                      </div>
                      {typeof licStatus?.expiresAt === 'number' && licStatus.expiresAt > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Expires:{' '}
                          {new Date(licStatus.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Status pill */}
              <div>
                <label className={labelCls}>Status</label>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      licStatus?.licensed
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}
                  >
                    {licStatus?.licensed ? 'Active' : 'Not Activated'}
                  </span>
                </div>
              </div>
            </div>

            {/* HW ID (legacy simple field kept for backwards compatibility) */}
            <div>
              <label className={labelCls}>Hardware ID</label>
              <div className="flex items-center gap-2">
                <input readOnly value={hwId} className={`${inputCls} font-mono text-xs bg-muted/50 cursor-text`} />
                <button onClick={() => { navigator.clipboard.writeText(hwId); toast.success('Copied!') }}
                  className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted whitespace-nowrap">Copy</button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Share this with your vendor to receive a license key.</p>
            </div>

            {/* Activate / Upgrade */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {licStatus?.licensed ? 'Upgrade / Replace License Key' : 'License Key'}
              </label>
              <input
                value={licKey}
                onChange={e => setLicKey(e.target.value)}
                placeholder="Enter license key..."
                className={inputCls}
              />
              {licStatus?.licensed && (
                <p className="text-xs text-muted-foreground mt-1">
                  💡 Enter a new license key to upgrade your tier or renew your license. Your data will be preserved.
                </p>
              )}
              <button
                onClick={handleActivate}
                disabled={activating || !licKey.trim()}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {activating
                  ? 'Processing...'
                  : licStatus?.licensed
                  ? 'Update License'
                  : 'Activate License'}
              </button>
            </div>
          </div>
        )}

        {tab === 'employees' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <p className="font-medium text-sm">Employee ID Format</p>
              <p className="text-xs text-muted-foreground">
                Configure how employee IDs are generated. Changes apply to new employees only.
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg border border-border text-center">
              <p className="text-xs text-muted-foreground mb-1">Next Employee ID Preview</p>
              <p className="text-2xl font-bold font-mono tracking-wider text-primary">{empIdPreview || '...'}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Prefix</label>
                <input
                  type="text"
                  placeholder="e.g. EMP, MH, STAFF"
                  value={empIdFormat.prefix}
                  maxLength={10}
                  onChange={(e) => setEmpIdFormat((p) => ({ ...p, prefix: e.target.value }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for no prefix</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Separator</label>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      ['-', 'Dash (-)'],
                      ['/', 'Slash (/)'],
                      ['_', 'Underscore (_)'],
                      ['', 'None'],
                    ] as const
                  ).map(([val, label]) => (
                    <label
                      key={label}
                      className="flex items-center gap-1.5 text-sm cursor-pointer px-3 py-1.5 border border-border rounded-md hover:bg-muted/50"
                      style={{
                        background: empIdFormat.separator === val ? 'hsl(var(--primary) / 0.1)' : undefined,
                        borderColor: empIdFormat.separator === val ? 'hsl(var(--primary))' : undefined,
                      }}
                    >
                      <input
                        type="radio"
                        name="emp-id-separator"
                        value={val}
                        checked={empIdFormat.separator === val}
                        onChange={() => setEmpIdFormat((p) => ({ ...p, separator: val }))}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={empIdFormat.useYear}
                  onChange={(e) => setEmpIdFormat((p) => ({ ...p, useYear: e.target.checked }))}
                  className="w-4 h-4"
                />
                Include current year ({new Date().getFullYear()})
              </label>

              <div>
                <label className="text-sm font-medium block mb-1">Number digits (padding)</label>
                <div className="flex gap-2 flex-wrap">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEmpIdFormat((p) => ({ ...p, padding: n }))}
                      className={`px-3 py-1.5 text-sm border rounded-md font-mono ${
                        empIdFormat.padding === n ? 'bg-primary/10 border-primary' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      {'0'.repeat(n - 1)}1
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">How many digits in the number part</p>
              </div>
            </div>

            <div className="p-3 bg-muted/20 rounded-lg border border-border">
              <p className="text-xs font-medium mb-2">Format Examples:</p>
              <div className="space-y-1 text-xs text-muted-foreground font-mono">
                {[1, 2, 3].map((n) => {
                  const parts: string[] = []
                  if (empIdFormat.prefix?.trim()) {
                    parts.push(empIdFormat.prefix.trim().toUpperCase())
                  }
                  if (empIdFormat.useYear) {
                    parts.push(String(new Date().getFullYear()))
                  }
                  parts.push(String(n).padStart(empIdFormat.padding, '0'))
                  return (
                    <p key={n}>{parts.join(empIdFormat.separator ?? '')}</p>
                  )
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveEmpIdFormat()}
              disabled={empIdSaving}
              className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 font-medium"
            >
              {empIdSaving ? 'Saving...' : 'Save Format'}
            </button>
          </div>
        )}

        {tab === 'attendance' && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Attendance Status Types</p>
                <p className="text-xs text-muted-foreground">
                  Manage attendance statuses. Default statuses cannot be deleted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingStatusId(null)
                  setStatusForm({
                    name: '',
                    color: '#6b7280',
                    emoji: '',
                    is_paid: 1,
                    counts_as_working: 0,
                  })
                  setShowStatusForm(true)
                }}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                + Add Status
              </button>
            </div>

            <div className="space-y-2">
              {attendanceStatuses.map(status => (
                <div
                  key={status.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="text-lg">{status.emoji}</span>
                    <div>
                      <p className="text-sm font-medium">
                        {status.name}
                        {status.is_default === 1 && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">Default</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status.is_paid ? '✓ Paid' : '✗ Unpaid'}
                        {' · '}
                        {status.counts_as_working ? 'Counts as working day' : 'Does not count'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStatusId(status.id)
                        setStatusForm({
                          name: status.name,
                          color: status.color,
                          emoji: status.emoji,
                          is_paid: status.is_paid,
                          counts_as_working: status.counts_as_working,
                        })
                        setShowStatusForm(true)
                      }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      ✏️
                    </button>
                    {status.is_default === 0 && (
                      <button
                        type="button"
                        onClick={() => void deleteStatus(status.id, status.is_default)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {showStatusForm && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
                <p className="text-sm font-semibold">
                  {editingStatusId ? 'Edit Status' : 'New Status'}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Eid Holiday"
                      value={statusForm.name}
                      onChange={e => setStatusForm(p => ({ ...p, name: e.target.value }))}
                      disabled={
                        !!editingStatusId &&
                        attendanceStatuses.find(s => s.id === editingStatusId)?.is_default === 1
                      }
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Emoji</label>
                    <input
                      type="text"
                      placeholder="🕌"
                      value={statusForm.emoji}
                      onChange={e => setStatusForm(p => ({ ...p, emoji: e.target.value }))}
                      disabled={
                        !!editingStatusId &&
                        attendanceStatuses.find(s => s.id === editingStatusId)?.is_default === 1
                      }
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={statusForm.color}
                      onChange={e => setStatusForm(p => ({ ...p, color: e.target.value }))}
                      className="w-10 h-8 rounded cursor-pointer border border-input"
                    />
                    <span className="text-sm text-muted-foreground">{statusForm.color}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statusForm.is_paid === 1}
                      onChange={e =>
                        setStatusForm(p => ({ ...p, is_paid: e.target.checked ? 1 : 0 }))
                      }
                      className="w-4 h-4"
                    />
                    Paid leave
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={statusForm.counts_as_working === 1}
                      onChange={e =>
                        setStatusForm(p => ({
                          ...p,
                          counts_as_working: e.target.checked ? 1 : 0,
                        }))
                      }
                      className="w-4 h-4"
                    />
                    Counts as working day
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveStatus()}
                    disabled={statusSaving || !statusForm.name.trim()}
                    className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90"
                  >
                    {statusSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStatusForm(false)
                      setEditingStatusId(null)
                    }}
                    className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold">Fingerprint Device</p>
              <p className="text-xs text-muted-foreground">
                Connect a fingerprint attendance device to auto-sync attendance records.
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">
                  Not configured — coming in future update
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'store-documents' && canStoreDocuments && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Store Documents</p>
                <p className="text-xs text-muted-foreground">
                  Trade license, insurance, lease agreements and other store documents. Only owner and manager can access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStoreDocForm(true)}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                + Add Document
              </button>
            </div>

            {storeDocs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                No store documents yet. Add your trade license, insurance and other important documents.
              </div>
            ) : (
              <div className="space-y-2">
                {storeDocs.map(doc => {
                  const isExpired =
                    doc.has_expiry === 1 && doc.expiry_date && new Date(doc.expiry_date) < new Date()
                  const isExpiringSoon =
                    doc.has_expiry === 1 &&
                    doc.expiry_date &&
                    !isExpired &&
                    new Date(doc.expiry_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">📄</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{doc.name}</p>
                            {isExpired && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                                Expired
                              </span>
                            )}
                            {isExpiringSoon && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
                                Expiring Soon
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
                            <span className="capitalize">{doc.doc_type.replace(/_/g, ' ')}</span>
                            {doc.has_expiry === 1 && doc.expiry_date && (
                              <span>Expires: {new Date(doc.expiry_date).toLocaleDateString()}</span>
                            )}
                            {doc.has_expiry !== 1 && <span>No expiry</span>}
                            {doc.uploaded_by_name && <span>by {doc.uploaded_by_name}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            void (async () => {
                              const r = await window.electronAPI.storeDocuments.openFile(doc.file_path)
                              if (!r.success) toast.error(r.error ?? 'Failed to open file')
                            })()
                          }
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Preview"
                        >
                          👁
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void (async () => {
                              const r = await window.electronAPI.storeDocuments.showInFolder(doc.file_path)
                              if (!r.success) toast.error(r.error ?? 'Failed to show in folder')
                            })()
                          }
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Show in folder"
                        >
                          📂
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteStoreDoc(doc.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {showStoreDocForm && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
                <p className="text-sm font-semibold">Add Document</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Document Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Trade License 2026"
                      value={storeDocForm.name}
                      onChange={e => setStoreDocForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Document Type</label>
                    <select
                      value={storeDocForm.doc_type}
                      onChange={e => setStoreDocForm(p => ({ ...p, doc_type: e.target.value }))}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="trade_license">Trade License</option>
                      <option value="municipality_cert">Municipality Certificate</option>
                      <option value="insurance">Insurance Policy</option>
                      <option value="lease">Lease Agreement</option>
                      <option value="bank_account">Bank Account</option>
                      <option value="tax_certificate">Tax Certificate</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storeDocForm.has_expiry === 1}
                      onChange={e =>
                        setStoreDocForm(p => ({
                          ...p,
                          has_expiry: e.target.checked ? 1 : 0,
                          expiry_date: e.target.checked ? p.expiry_date : '',
                        }))
                      }
                      className="w-4 h-4"
                    />
                    Has expiry date
                  </label>
                  {storeDocForm.has_expiry === 1 && (
                    <input
                      type="date"
                      value={storeDocForm.expiry_date}
                      onChange={e => setStoreDocForm(p => ({ ...p, expiry_date: e.target.value }))}
                      className="border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    />
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={storeDocForm.notes}
                  onChange={e => setStoreDocForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                />

                <div>
                  <button
                    type="button"
                    onClick={() => void pickStoreDocFile()}
                    className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50"
                  >
                    📎 Choose File
                  </button>
                  {storeDocFile && (
                    <span className="ml-2 text-xs text-muted-foreground">{storeDocFile.name}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void uploadStoreDoc()}
                    disabled={storeDocSaving || !storeDocForm.name.trim() || !storeDocFile}
                    className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90"
                  >
                    {storeDocSaving ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStoreDocForm(false)
                      setStoreDocFile(null)
                    }}
                    className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'about' && (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shrink-0">
                <span className="text-2xl font-black text-primary-foreground">M</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Mahali Garage</h2>
                <p className="text-sm text-muted-foreground">Version {appVersion || '...'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">By Bytecra</p>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Software Updates</p>
                  <p className="text-xs text-muted-foreground">Current version: v{appVersion}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void checkForUpdates()}
                  disabled={updateStatus.checking}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {updateStatus.checking ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                      Checking...
                    </>
                  ) : (
                    'Check for Updates'
                  )}
                </button>
              </div>

              {updateStatus.checked && (
                <div
                  className={`rounded-lg p-4 border ${
                    updateStatus.hasUpdate
                      ? 'border-primary/30 bg-primary/5'
                      : updateStatus.error
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                        : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                  }`}
                >
                  {updateStatus.error ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">⚠️ Could not check for updates</p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">{updateStatus.error}</p>
                      <p className="text-xs text-muted-foreground mt-1">Connect to internet and try again.</p>
                    </div>
                  ) : updateStatus.hasUpdate ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-bold text-primary">🎉 New version available!</p>
                        <p className="text-sm font-medium mt-1">
                          {updateStatus.releaseName || `v${updateStatus.latestVersion}`}
                        </p>
                        {updateStatus.publishedAt && (
                          <p className="text-xs text-muted-foreground">
                            Released: {new Date(updateStatus.publishedAt).toLocaleDateString()}
                          </p>
                        )}
                        {updateStatus.releaseNotes && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{updateStatus.releaseNotes}</p>
                        )}
                      </div>
                      <div className="space-y-3">
                        {updateStatus.downloadSize != null && updateStatus.downloadSize > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Size: {(updateStatus.downloadSize / 1024 / 1024).toFixed(1)} MB
                          </p>
                        )}

                        {!downloadState.downloading &&
                          !downloadState.done &&
                          !downloadState.error && (
                          <div className="flex gap-2">
                            {updateStatus.downloadUrl ? (
                              <button
                                type="button"
                                onClick={() => void handleDownloadUpdate()}
                                className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
                              >
                                ⬇️ Download v{updateStatus.latestVersion}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                if (updateStatus.releaseUrl) {
                                  void window.electronAPI.shell.openExternal(updateStatus.releaseUrl)
                                }
                              }}
                              className={`py-2 text-sm border border-border rounded-md hover:bg-muted/50 ${
                                updateStatus.downloadUrl ? 'px-3' : 'flex-1'
                              }`}
                            >
                              Open in Browser
                            </button>
                          </div>
                        )}

                        {downloadState.downloading && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Downloading...</span>
                              <span>
                                {downloadState.progress > 0
                                  ? `${downloadState.progress}%`
                                  : 'Starting...'}
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className="h-2 bg-primary rounded-full transition-all duration-300"
                                style={{
                                  width:
                                    downloadState.progress > 0
                                      ? `${downloadState.progress}%`
                                      : '10%',
                                  animation:
                                    downloadState.progress === 0 ? 'pulse 1s infinite' : 'none',
                                }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                              Please wait — do not close the app
                            </p>
                          </div>
                        )}

                        {downloadState.error && (
                          <div className="space-y-2">
                            <p className="text-xs text-destructive">❌ {downloadState.error}</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDownloadUpdate()}
                                className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                              >
                                Retry Download
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (updateStatus.releaseUrl) {
                                    void window.electronAPI.shell.openExternal(updateStatus.releaseUrl)
                                  }
                                }}
                                className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted/50"
                              >
                                Browser
                              </button>
                            </div>
                          </div>
                        )}

                        {downloadState.done && (
                          <div className="space-y-2">
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                              ✅ Downloaded successfully
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleInstallUpdate()}
                              className="w-full py-2.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                            >
                              🚀 Install & Restart
                            </button>
                            <p className="text-xs text-muted-foreground text-center">
                              App will close and installer will run
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">✅ You&apos;re up to date</p>
                      <p className="text-xs text-muted-foreground mt-1">v{appVersion} is the latest version.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border" />

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">© 2026 Bytecra. All rights reserved.</p>
              <p className="text-xs text-muted-foreground">Built for UAE garage management.</p>
            </div>
          </div>
        )}
      </div>

      {/* Activity Log — full-width outside the max-w-2xl card */}
      {tab === 'activity' && (
        <div className="mt-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-muted-foreground">{t('common.from')}:</label>
              <input type="date" value={actFromDate} onChange={e => setActFromDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-muted-foreground">{t('common.to')}:</label>
              <input type="date" value={actToDate} onChange={e => setActToDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={() => loadActivity(0)}
              className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {t('common.search')}
            </button>
            <span className="text-xs text-muted-foreground ms-auto">
              {activityTotal} {t('common.total').toLowerCase()}
            </span>
          </div>

          {activityRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">{t('settings.activity.noActivity')}</div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium w-40">{t('common.date')}</th>
                    <th className="text-start px-4 py-3 font-medium w-36">{t('settings.activity.employee')}</th>
                    <th className="text-start px-4 py-3 font-medium w-44">{t('settings.activity.action')}</th>
                    <th className="text-start px-4 py-3 font-medium">{t('settings.activity.details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activityRows.map(row => {
                    const actionLabel = t(`settings.activity.actions.${row.action}`, { defaultValue: row.action })
                    let detailText = ''
                    try { if (row.details) detailText = Object.entries(JSON.parse(row.details)).map(([k, v]) => `${k}: ${v}`).join(' · ') }
                    catch { detailText = row.details ?? '' }
                    const actionColors: Record<string, string> = {
                      'sale.create':           'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
                      'sale.void':             'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
                      'stock.adjust':          'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
                      'repair.create':         'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
                      'repair.status_change':  'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
                    }
                    return (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium">{row.full_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[row.action] ?? 'bg-muted text-muted-foreground'}`}>
                            {actionLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{detailText || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {activityTotal > ACTIVITY_PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <button disabled={activityPage === 0} onClick={() => loadActivity(activityPage - 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-40">
                    ← {t('common.previous')}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {activityPage + 1} / {Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE)}
                  </span>
                  <button disabled={(activityPage + 1) * ACTIVITY_PAGE_SIZE >= activityTotal} onClick={() => loadActivity(activityPage + 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-40">
                    {t('common.next')} →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
