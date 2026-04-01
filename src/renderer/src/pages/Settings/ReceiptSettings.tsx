import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from '../../store/notificationStore'

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
  'receipt.brand_logos',
  'receipt.terms',
  'receipt.programming_print_mode',
]

function parseBrandLogos(raw: string | undefined): string[] {
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

export default function ReceiptSettings(): JSX.Element {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.electronAPI.settings.getAll().then(sRes => {
      if (sRes.success && sRes.data) {
        const data = sRes.data as Record<string, string>
        setSettings({
          ...data,
          'receipt.brand_logos': data['receipt.brand_logos'] ?? '',
        })
      }
    })
  }, [])

  const set = (key: string, val: string): void =>
    setSettings(s => ({ ...s, [key]: val }))

  const isOn = (key: string, def = 'true'): boolean =>
    (settings[key] ?? def) === 'true'

  const toggle = (key: string, def = 'true'): void =>
    set(key, isOn(key, def) ? 'false' : 'true')

  const brandLogos: string[] = parseBrandLogos(settings['receipt.brand_logos']).slice(0, 5)

  const setBrandLogos = (logos: string[]): void => {
    set('receipt.brand_logos', JSON.stringify(logos.slice(0, 5)))
  }

  const removeLogoAt = (index: number): void => {
    setBrandLogos(brandLogos.filter((_, i) => i !== index))
  }

  const handleLogoFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) {
      toast.error('Please choose an image')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string' || !result.startsWith('data:image/')) return
      setSettings(s => {
        const current = parseBrandLogos(s['receipt.brand_logos'])
        if (current.length >= 5) return s
        const next = [...current, result].slice(0, 5)
        return { ...s, 'receipt.brand_logos': JSON.stringify(next) }
      })
    }
    reader.readAsDataURL(f)
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

      {/* ── We Work With — Logos ─────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">We Work With — Logos</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Upload up to 5 logos to show in the &quot;We Work with&quot; section on printed receipts.
        </p>
        <input
          ref={fileInputRef}
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
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {brandLogos.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 shrink-0 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
              title="Add logo"
            >
              <Plus className="w-7 h-7" />
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {brandLogos.length}/5 logos added
        </p>
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
