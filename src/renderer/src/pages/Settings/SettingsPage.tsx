import { useState, useEffect, useCallback, lazy, Suspense, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertCircle, Upload } from 'lucide-react'
import { toast } from '../../store/notificationStore'
import { useThemeStore } from '../../store/themeStore'
import { useLangStore } from '../../store/langStore'
import { useBrandingStore } from '../../store/brandingStore'
import { useCurrencyStore } from '../../store/currencyStore'
import { usePermission } from '../../hooks/usePermission'
import { DASHBOARD_WIDGETS, parseDashboardWidgets } from '../../lib/dashboardWidgets'

const JobTypesSettings  = lazy(() => import('./JobTypesSettings'))
const CarBrandsSettings = lazy(() => import('./CarBrandsSettings'))
const BackupSettingsTab = lazy(() => import('./BackupSettings'))

type Tab = 'store' | 'invoice' | 'tax' | 'appearance' | 'payment' | 'backup' | 'license' | 'activity' | 'job-types' | 'car-brands' | 'dashboard' | 'payroll' | 'tv-display'

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

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const { setBranding } = useBrandingStore()
  const { syncFromSettings: syncCurrency } = useCurrencyStore()
  const canBackup      = usePermission('backup.manage')
  const canSettings    = usePermission('settings.manage')
  const canActivityLog = usePermission('activity_log.view')
  const [tab, setTab] = useState<Tab>('store')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [licStatus, setLicStatus] = useState<LicenseStatus | null>(null)
  const [licKey, setLicKey] = useState('')
  const [hwId, setHwId] = useState('')
  const [activating, setActivating] = useState(false)
  const [brands, setBrands] = useState<CarBrand[]>([])
  const [tvDisplays, setTvDisplays] = useState<TvDisplayOption[]>([])

  // Activity log state
  const [activityRows, setActivityRows]   = useState<ActivityRow[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityPage, setActivityPage]   = useState(0)
  const [actFromDate, setActFromDate]     = useState('')
  const [actToDate, setActToDate]         = useState('')
  const ACTIVITY_PAGE_SIZE = 50
  const MAX_LOGO_BYTES = 1_500_000

  const load = async () => {
    const res = await window.electronAPI.settings.getAll()
    if (res.success) {
      const data = res.data as Record<string, string>
      setSettings(data)
      syncCurrency(data)
    }
    if (tab === 'invoice') {
      const bRes = await window.electronAPI.carBrands.list()
      if (bRes.success && bRes.data) setBrands(bRes.data as CarBrand[])
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

  useEffect(() => { load() }, [tab])
  useEffect(() => { if (tab === 'activity') loadActivity(0) }, [tab, loadActivity])

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
      'receipt.terms':              settings['receipt.terms']              ?? '',
      'receipt.programming_print_mode': settings['receipt.programming_print_mode'] ?? 'a4_only',
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

  const TABS: Array<{ key: Tab; label: string; guard?: boolean }> = [
    { key: 'store',      label: t('settings.storeInfo'), guard: canSettings },
    { key: 'invoice',    label: t('settings.invoice'),   guard: canSettings },
    { key: 'tax',        label: t('settings.tax'),       guard: canSettings },
    { key: 'appearance', label: t('settings.appearance') },
    { key: 'payment',    label: t('settings.paymentMethods'), guard: canSettings },
    { key: 'job-types',  label: t('settings.jobTypes', { defaultValue: 'Job Types' }), guard: canSettings },
    { key: 'car-brands', label: t('settings.carBrands', { defaultValue: 'Car Brands' }), guard: canSettings },
    { key: 'dashboard',  label: 'Dashboard', guard: canSettings },
    { key: 'tv-display', label: t('settings.tvDisplay', { defaultValue: 'TV Display' }), guard: canSettings },
    { key: 'payroll',    label: t('settings.payroll', { defaultValue: 'Payroll' }), guard: canSettings },
    { key: 'backup',     label: t('settings.backup'),         guard: canBackup },
    { key: 'activity',   label: t('settings.activityLog'),    guard: canActivityLog },
    { key: 'license',    label: 'License' },
  ]

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1 text-foreground'
  const saveBtnCls = 'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60'
  const dashboardWidgets = parseDashboardWidgets(settings['dashboard_widgets'])

  const toggleDashboardWidget = (widgetId: string): void => {
    const next = { ...dashboardWidgets, [widgetId]: !dashboardWidgets[widgetId as keyof typeof dashboardWidgets] }
    set('dashboard_widgets', JSON.stringify(next))
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('settings.title')}</h1>

      <div className="flex gap-1 border-b border-border mb-6 flex-wrap">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      <div className={`bg-card border border-border rounded-xl p-6 ${tab === 'car-brands' || tab === 'invoice' ? 'max-w-3xl' : 'max-w-2xl'}`}>

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

            {/* ── Supported Brands ── */}
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-1">Supported Brands</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Brands shown in the "We Work with" section of the printed receipt.
              </p>
              {brands.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No brands found — add brands in the <strong>Car Brands</strong> tab first.
                </p>
              ) : (() => {
                const selected = (settings['receipt.supported_brands'] ?? '')
                  .split(',').map(v => v.trim()).filter(Boolean)
                const toggle = (name: string): void => {
                  const next = selected.includes(name)
                    ? selected.filter(b => b !== name)
                    : [...selected, name]
                  set('receipt.supported_brands', next.join(','))
                }
                return (
                  <div className="grid grid-cols-3 gap-2">
                    {brands.map(b => (
                      <label
                        key={b.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          selected.includes(b.name) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={selected.includes(b.name)}
                          onChange={() => toggle(b.name)}
                        />
                        {b.logo && <img src={b.logo} alt={b.name} className="w-6 h-6 object-contain shrink-0" />}
                        <span className="text-sm truncate">{b.name}</span>
                      </label>
                    ))}
                  </div>
                )
              })()}
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
                  ['a4_or_thermal', 'A4 or Thermal (thermal printer config coming in hardware phase)'],
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
          <div className="space-y-4">
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
            <button onClick={() => save(['tv_display_screen'])} disabled={saving} className={saveBtnCls}>
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
