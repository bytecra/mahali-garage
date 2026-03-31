import { useState, useEffect } from 'react'
import { toast } from '../../store/notificationStore'

interface CarBrand {
  id: number
  name: string
  logo: string | null
}

const TOGGLES: Array<[string, string, string]> = [
  ['receipt.show_vat',           'true',  'Show VAT on receipt'],
  ['receipt.show_brands',        'true',  'Show "We Work with" brands section'],
  ['receipt.show_terms',         'true',  'Show "Our terms" footer'],
  ['receipt.show_logo',          'true',  'Show garage logo on receipt'],
  ['receipt.show_customer_info', 'true',  'Show customer info on receipt'],
  ['receipt.show_car_info',      'true',  'Show car info on receipt'],
]

const RECEIPT_KEYS = [
  'receipt.show_vat',
  'receipt.show_brands',
  'receipt.show_terms',
  'receipt.show_logo',
  'receipt.show_customer_info',
  'receipt.show_car_info',
  'receipt.supported_brands',
  'receipt.terms',
  'receipt.programming_print_mode',
]

export default function ReceiptSettings(): JSX.Element {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [brands, setBrands] = useState<CarBrand[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.electronAPI.settings.getAll(),
      window.electronAPI.carBrands.list(),
    ]).then(([sRes, bRes]) => {
      if (sRes.success && sRes.data) setSettings(sRes.data as Record<string, string>)
      if (bRes.success && bRes.data) setBrands(bRes.data as CarBrand[])
    })
  }, [])

  const set = (key: string, val: string): void =>
    setSettings(s => ({ ...s, [key]: val }))

  const isOn = (key: string, def = 'true'): boolean =>
    (settings[key] ?? def) === 'true'

  const toggle = (key: string, def = 'true'): void =>
    set(key, isOn(key, def) ? 'false' : 'true')

  const selectedBrands: string[] = (settings['receipt.supported_brands'] ?? '')
    .split(',').map(v => v.trim()).filter(Boolean)

  const toggleBrand = (name: string): void => {
    const next = selectedBrands.includes(name)
      ? selectedBrands.filter(b => b !== name)
      : [...selectedBrands, name]
    set('receipt.supported_brands', next.join(','))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    const entries: Record<string, string> = {}
    for (const k of RECEIPT_KEYS) entries[k] = settings[k] ?? ''
    const res = await window.electronAPI.settings.setBulk(entries)
    setSaving(false)
    if (res.success) toast.success('Receipt settings saved')
    else toast.error(res.error ?? 'Failed to save')
  }

  const inputCls  = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls  = 'block text-sm font-medium mb-1 text-foreground'
  const saveBtnCls = 'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60'

  return (
    <div className="space-y-6">

      {/* ── Print Sections ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Print Sections</h3>
        <div className="space-y-2">
          {TOGGLES.map(([key, def, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={isOn(key, def)}
                onChange={() => toggle(key, def)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Supported Brands ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Supported Brands</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Brands shown in the "We Work with" section of the printed receipt.
        </p>
        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No brands found — add brands in the <strong>Car Brands</strong> tab first.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {brands.map(b => (
              <label
                key={b.id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedBrands.includes(b.name)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={selectedBrands.includes(b.name)}
                  onChange={() => toggleBrand(b.name)}
                />
                {b.logo && (
                  <img src={b.logo} alt={b.name} className="w-6 h-6 object-contain shrink-0" />
                )}
                <span className="text-sm truncate">{b.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Custom Terms ───────────────────────────────────── */}
      <div>
        <label className={labelCls}>Custom Terms Text</label>
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

      {/* ── Programming Print Mode ─────────────────────────── */}
      <div>
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

      <button onClick={() => void save()} disabled={saving} className={saveBtnCls}>
        {saving ? 'Saving…' : 'Save Receipt Settings'}
      </button>
    </div>
  )
}
