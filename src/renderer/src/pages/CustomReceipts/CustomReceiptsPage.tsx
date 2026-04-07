import { useState, useEffect, useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronRight, Code2, Eye, Plus, Printer, Trash2, Wrench } from 'lucide-react'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import Modal from '../../components/shared/Modal'
import { formatCurrency, formatDate } from '../../lib/utils'
import { printCustomReceiptA4 } from '../../lib/printCustomReceiptA4'
import CurrencyText from '../../components/shared/CurrencyText'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/notificationStore'

type Department = 'mechanical' | 'programming' | 'both'

interface ServiceLine {
  id: string
  service_name: string
  cost: string
  sell_price: string
}
interface SmartCustomServiceLine extends ServiceLine {
  department: 'mechanical' | 'programming'
}

interface Receipt {
  id: number
  receipt_number: string
  department: Department
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  plate_number: string | null
  car_company: string | null
  car_model: string | null
  car_year: string | null
  car_type: string | null
  mechanical_services_json: string | null
  programming_services_json: string | null
  amount: number
  payment_method: string | null
  notes: string | null
  created_by_name: string | null
  created_at: string
  smart_recipe: number
  discount_type?: string | null
  discount_value?: number | null
  discount_amount?: number | null
  customer_id?: number | null
  loyalty_points?: number | null
  loyalty_stamps?: number | null
  loyalty_visits?: number | null
  inspection_data?: string | null
}

interface ReceiptEmployeePickerRow {
  id: number
  employee_id: string
  full_name: string
  department: string
}

interface CustomerLite { id: number; name: string; phone: string | null }
interface VehicleLite { id: number; make: string; model: string; year: number | null; license_plate: string | null }
interface BrandLite { id: number; name: string; logo: string | null }
interface CatalogService { id: number; service_name: string; model: string; price: number; department: 'mechanical' | 'programming' }
type WizardStep = 1 | 2 | 3 | 4 | 5

type LoyaltyCfgCache = {
  enabled: boolean
  type: string
  pointsLabel: string
  stampsForReward: number
  deptMode: string
  stampRewardDesc: string
}

type SelectedCustomerLoyalty = {
  points: number
  stamps: number
  total_visits: number
  tier_level: number
  department: string
  customer_id: number
}

function deptParamForLoyalty(d: Department): 'mechanical' | 'programming' | undefined {
  if (d === 'both') return undefined
  return d
}

function escapeThermalHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function buildThermalHtml(receipt: Receipt): Promise<string> {
  const getS = async (key: string, def = ''): Promise<string> => {
    try {
      const r = await window.electronAPI.settings.get(key)
      if (!r?.success) return def
      const v = r.data
      return v != null && v !== '' ? String(v) : def
    } catch {
      return def
    }
  }

  const [
    storeName,
    showLogo,
    showCustomer,
    showCar,
    showServices,
    showTotal,
    showFooter,
    footerText,
    currencySymbol,
  ] = await Promise.all([
    getS('store.name', 'Mahali Garage'),
    getS('printer.thermal_show_logo', 'true'),
    getS('printer.thermal_show_customer', 'true'),
    getS('printer.thermal_show_car', 'true'),
    getS('printer.thermal_show_services', 'true'),
    getS('printer.thermal_show_total', 'true'),
    getS('printer.thermal_show_footer', 'true'),
    getS('receipt.terms', 'Thank you for your business!'),
    getS('store.currency_symbol', 'د.إ'),
  ])

  const show = (key: string): boolean => key !== 'false'

  const services = (() => {
    try {
      const mechRaw = receipt.mechanical_services_json
        ? (JSON.parse(receipt.mechanical_services_json) as unknown[])
        : []
      const progRaw = receipt.programming_services_json
        ? (JSON.parse(receipt.programming_services_json) as unknown[])
        : []
      const norm = (arr: unknown[]): Array<{ service_name: string; sell_price: number }> =>
        arr.map(row => {
          const x = row as { service_name?: string; name?: string; sell_price?: number }
          return {
            service_name: String(x.service_name ?? x.name ?? '').trim(),
            sell_price: Number(x.sell_price ?? 0),
          }
        }).filter(s => s.service_name !== '')
      return [...norm(mechRaw), ...norm(progRaw)]
    } catch {
      return []
    }
  })()

  const date = new Date(receipt.created_at).toLocaleDateString()
  const time = new Date(receipt.created_at).toLocaleTimeString()

  const rows = services
    .map(
      s => `<div style="display:flex;justify-content:space-between;">
        <span style="max-width:50mm;word-break:break-word;">
          ${escapeThermalHtml(s.service_name)}
        </span>
        <span>${escapeThermalHtml(currencySymbol)}
          ${Number(s.sell_price).toFixed(2)}
        </span>
      </div>`
    )
    .join('')

  const carLine = [receipt.car_company, receipt.car_model].filter(Boolean).join(' ')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 3mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      width: 74mm;
      margin: 0;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 14px; }
    .line {
      border-top: 1px dashed #000;
      margin: 3px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 13px;
      margin-top: 2px;
    }
  </style>
</head>
<body>

  ${show(showLogo)
    ? `
    <div class="center bold large">
      ${escapeThermalHtml(storeName)}
    </div>
    <div class="center" style="font-size:9px;margin-bottom:2px;">
      Programming Department
    </div>
  `
    : ''}

  <div class="line"></div>

  <div class="row">
    <span>Receipt:</span>
    <span class="bold">
      ${escapeThermalHtml(receipt.receipt_number)}
    </span>
  </div>
  <div class="row">
    <span>Date:</span>
    <span>${escapeThermalHtml(date)}</span>
  </div>
  <div class="row">
    <span>Time:</span>
    <span>${escapeThermalHtml(time)}</span>
  </div>

  ${show(showCustomer) &&
  receipt.customer_name &&
  receipt.customer_name !== 'Walk-in Customer'
    ? `
    <div class="line"></div>
    <div class="row">
      <span>Customer:</span>
      <span>${escapeThermalHtml(receipt.customer_name)}</span>
    </div>
  `
    : ''}

  ${show(showCar) && (receipt.car_company || receipt.plate_number)
    ? `
    <div class="row">
      <span>Car:</span>
      <span>
        ${escapeThermalHtml(carLine)}
      </span>
    </div>
    ${receipt.plate_number
      ? `
      <div class="row">
        <span>Plate:</span>
        <span class="bold">
          ${escapeThermalHtml(receipt.plate_number)}
        </span>
      </div>
    `
      : ''}
  `
    : ''}

  ${show(showServices) && services.length > 0
    ? `
    <div class="line"></div>
    <div class="bold" style="margin-bottom:2px;">
      Services:
    </div>
    ${rows}
  `
    : ''}

  ${show(showTotal)
    ? `
    <div class="line"></div>
    <div class="total-row">
      <span>TOTAL:</span>
      <span>${escapeThermalHtml(currencySymbol)}
        ${Number(receipt.amount).toFixed(2)}
      </span>
    </div>
  `
    : ''}

  ${show(showFooter) && footerText
    ? `
    <div class="line"></div>
    <div class="center" style="font-size:10px;margin-top:2px;">
      ${escapeThermalHtml(footerText)}
    </div>
  `
    : ''}

  <div style="margin-top:8px;"></div>

</body>
</html>`
}

type InspectionMarkerType = 'scratch' | 'dent' | 'broken' | 'other'

interface InspectionMarker {
  x: number
  y: number
  type: InspectionMarkerType
  note: string
}

function CarTopViewSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 200 350"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full max-h-48 text-foreground"
      style={{ maxWidth: '160px' }}
    >
      <rect x="40" y="60" width="120" height="230" rx="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="55" y="75" width="90" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="55" y="225" width="90" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="30" width="100" height="35" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="285" width="100" height="35" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="55" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="160" y="55" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="250" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="160" y="250" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="40" y1="175" x2="160" y2="175" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
      <rect x="43" y="148" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="143" y="148" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="43" y="195" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="143" y="195" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <text x="100" y="22" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">
        FRONT
      </text>
      <text x="100" y="338" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">
        REAR
      </text>
    </svg>
  )
}

function CarInspectionPanel(props: {
  showInspection: boolean
  setShowInspection: Dispatch<SetStateAction<boolean>>
  inspectionMarkers: InspectionMarker[]
  setInspectionMarkers: Dispatch<SetStateAction<InspectionMarker[]>>
  inspectionNotes: string
  setInspectionNotes: Dispatch<SetStateAction<string>>
  selectedMarkerType: InspectionMarkerType
  setSelectedMarkerType: Dispatch<SetStateAction<InspectionMarkerType>>
  t: (key: string, opts?: { defaultValue?: string }) => string
}): JSX.Element {
  const {
    showInspection,
    setShowInspection,
    inspectionMarkers,
    setInspectionMarkers,
    inspectionNotes,
    setInspectionNotes,
    selectedMarkerType,
    setSelectedMarkerType,
    t,
  } = props

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setShowInspection((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          🚗 Car Inspection Diagram
          {inspectionMarkers.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
              {inspectionMarkers.length} mark
              {inspectionMarkers.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span className="text-muted-foreground">{showInspection ? '▲' : '▼'}</span>
      </button>

      {showInspection && (
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ['scratch', '🔴', 'Scratch'],
                ['dent', '🟠', 'Dent'],
                ['broken', '⚫', 'Broken'],
                ['other', '🟡', 'Other'],
              ] as const
            ).map(([type, emoji, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedMarkerType(type)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  selectedMarkerType === type
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {emoji} {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{t('customReceipts.inspectionHint', { defaultValue: 'Click on the car diagram to mark damage' })}</p>

          <div
            className="relative border border-border rounded-lg bg-white dark:bg-slate-900 cursor-crosshair select-none"
            style={{ paddingBottom: '60%' }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = ((e.clientX - rect.left) / rect.width) * 100
              const y = ((e.clientY - rect.top) / rect.height) * 100
              setInspectionMarkers((prev) => [
                ...prev,
                {
                  x: Math.round(x * 10) / 10,
                  y: Math.round(y * 10) / 10,
                  type: selectedMarkerType,
                  note: '',
                },
              ])
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <CarTopViewSvg />
            </div>

            {inspectionMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer transform -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-md"
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                  backgroundColor:
                    marker.type === 'scratch'
                      ? '#ef4444'
                      : marker.type === 'dent'
                        ? '#f97316'
                        : marker.type === 'broken'
                          ? '#1e293b'
                          : '#eab308',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setInspectionMarkers((prev) => prev.filter((_, idx) => idx !== i))
                }}
                title="Click to remove"
              >
                {i + 1}
              </div>
            ))}
          </div>

          {inspectionMarkers.length > 0 && (
            <div className="space-y-1">
              {inspectionMarkers.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor:
                        m.type === 'scratch'
                          ? '#ef4444'
                          : m.type === 'dent'
                            ? '#f97316'
                            : m.type === 'broken'
                              ? '#1e293b'
                              : '#eab308',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="capitalize font-medium">{m.type}</span>
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={m.note}
                    onChange={(e) => {
                      const updated = [...inspectionMarkers]
                      updated[i] = { ...updated[i], note: e.target.value }
                      setInspectionMarkers(updated)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 border border-input rounded px-2 py-1 bg-background text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setInspectionMarkers((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="General inspection notes..."
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
          />

          {inspectionMarkers.length > 0 && (
            <button type="button" onClick={() => setInspectionMarkers([])} className="text-xs text-muted-foreground hover:text-destructive">
              Clear all markers
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function CustomReceiptsPage(): JSX.Element {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const role = user?.role
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'custom' | 'smart'>('list')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [viewReceipt, setViewReceipt] = useState<Receipt | null>(null)

  const [department, setDepartment] = useState<Department>('both')
  const [walkInCustomer, setWalkInCustomer] = useState(false)
  const [walkInCar, setWalkInCar] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer'>('Cash')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [carCompany, setCarCompany] = useState('')
  const [carModel, setCarModel] = useState('')
  const [carYear, setCarYear] = useState('')
  const [mechanical, setMechanical] = useState<ServiceLine[]>([newLine()])
  const [programming, setProgramming] = useState<ServiceLine[]>([newLine()])
  const [discountType, setDiscountType] = useState<'percent' | 'fixed' | ''>('')
  const [discountValue, setDiscountValue] = useState<string>('')
  const [smartStep, setSmartStep] = useState<WizardStep>(1)
  const [smartDepartment, setSmartDepartment] = useState<Department>('mechanical')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(null)
  const [customerVehicles, setCustomerVehicles] = useState<VehicleLite[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleLite | null>(null)
  const [smartWalkInCustomer, setSmartWalkInCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [brands, setBrands] = useState<BrandLite[]>([])
  const [brandSearch, setBrandSearch] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<BrandLite | null>(null)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [newModel, setNewModel] = useState('')
  const [catalogServices, setCatalogServices] = useState<Array<{ id: number; name: string; sell: string; checked: boolean; department: 'mechanical' | 'programming' }>>([])
  const [smartCustomServices, setSmartCustomServices] = useState<SmartCustomServiceLine[]>([])
  const [smartDiscountType, setSmartDiscountType] = useState<'percent' | 'fixed' | ''>('')
  const [smartDiscountValue, setSmartDiscountValue] = useState<string>('')
  const [selectedCustomerLoyalty, setSelectedCustomerLoyalty] = useState<SelectedCustomerLoyalty | null>(null)
  const [loyaltyCfgCache, setLoyaltyCfgCache] = useState<LoyaltyCfgCache | null>(null)
  const [printChoiceOpen, setPrintChoiceOpen] = useState(false)
  const [pendingPrintReceipt, setPendingPrintReceipt] = useState<Receipt | null>(null)
  const [thermalPrinting, setThermalPrinting] = useState(false)
  const [includeSignatures, setIncludeSignatures] = useState(() => {
    try {
      return localStorage.getItem('invoiceIncludeSignatures') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('invoiceIncludeSignatures', includeSignatures ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [includeSignatures])

  useEffect(() => {
    const dialogOpen = printChoiceOpen || viewReceipt != null
    if (!dialogOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        setIncludeSignatures(s => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [printChoiceOpen, viewReceipt])

  const [employees, setEmployees] = useState<ReceiptEmployeePickerRow[]>([])
  const [primaryEmployeeId, setPrimaryEmployeeId] = useState<number | null>(null)
  const [assistantEmployeeId, setAssistantEmployeeId] = useState<number | null>(null)
  const [hoursWorked, setHoursWorked] = useState('')
  const [workStartTime, setWorkStartTime] = useState('')
  const [workEndTime, setWorkEndTime] = useState('')
  const [showInspection, setShowInspection] = useState(false)
  const [inspectionMarkers, setInspectionMarkers] = useState<InspectionMarker[]>([])
  const [inspectionNotes, setInspectionNotes] = useState('')
  const [selectedMarkerType, setSelectedMarkerType] = useState<InspectionMarkerType>('scratch')

  const canCreate = ['owner', 'manager'].includes(role ?? '')
  const canDelete = ['owner', 'manager'].includes(role ?? '')

  const loadCustomerLoyalty = useCallback(async (
    customerId: number,
    department?: 'mechanical' | 'programming'
  ): Promise<void> => {
    try {
      let cfg = loyaltyCfgCache
      if (!cfg) {
        const lcRes = await window.electronAPI.settings.get('loyalty.config')
        if (lcRes?.success && lcRes.data) {
          const raw = JSON.parse(lcRes.data) as Record<string, unknown>
          if (!raw.enabled) return
          cfg = {
            enabled: Boolean(raw.enabled),
            type: String(raw.type ?? ''),
            pointsLabel: String(raw.pointsLabel ?? 'Points'),
            stampsForReward: Number(raw.stampsForReward) || 10,
            deptMode: String(raw.deptMode ?? 'all'),
            stampRewardDesc: String(raw.stampRewardDesc ?? ''),
          }
          setLoyaltyCfgCache(cfg)
        } else return
      }
      if (!cfg?.enabled) return
      const deptArg = cfg.deptMode === 'per_dept' && department ? department : 'all'
      const lr = await window.electronAPI.loyalty.get(customerId, deptArg)
      if (lr?.success && lr.data) {
        const d = lr.data
        setSelectedCustomerLoyalty({
          points: d.points,
          stamps: d.stamps,
          total_visits: d.total_visits,
          tier_level: d.tier_level,
          department: d.department,
          customer_id: d.customer_id,
        })
      }
    } catch { /* non-fatal */ }
  }, [loyaltyCfgCache])

  useEffect(() => {
    if (mode !== 'custom' || walkInCustomer || !selectedCustomer?.id) return
    void loadCustomerLoyalty(selectedCustomer.id, deptParamForLoyalty(department))
    // Intentionally omit loadCustomerLoyalty: it changes when loyaltyCfgCache is first set and would double-fetch.
  }, [mode, walkInCustomer, selectedCustomer?.id, department])

  const load = useCallback(async () => {
    try {
      const res = await window.electronAPI.customReceipts.list({
        page: 1,
        pageSize: 500,
      }) as { success: boolean; data?: { rows: Receipt[]; total: number } }
      if (res.success && res.data) {
        setReceipts(res.data.rows)
        setTotal(res.data.total)
      }
    } catch { /* */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    void (async () => {
      const empRes = await window.electronAPI.employees.list({ status: 'active' }) as {
        success: boolean
        data?: Array<{ id: number; employee_id: string; full_name: string; department: string | null }>
      }
      if (empRes?.success && empRes.data) {
        setEmployees(
          empRes.data.map(e => ({
            id: e.id,
            employee_id: String(e.employee_id ?? ''),
            full_name: String(e.full_name ?? ''),
            department: String(e.department ?? '').trim().toLowerCase(),
          })),
        )
      }
    })()
  }, [])

  useEffect(() => {
    const modeParam = (searchParams.get('mode') || '').toLowerCase()
    if (modeParam === 'smart' && mode !== 'smart') {
      resetSmartFlow()
      setMode('smart')
      return
    }
    if (modeParam === 'custom' && mode !== 'custom') {
      resetForm()
      setMode('custom')
      return
    }
    if (modeParam !== 'smart' && mode === 'smart') {
      setMode('list')
      return
    }
    if (modeParam !== 'custom' && mode === 'custom') {
      setMode('list')
    }
  }, [searchParams])

  useEffect(() => {
    const searchActive = mode === 'custom' || (mode === 'smart' && smartStep === 2)
    if (!searchActive) return
    if (!customerQuery.trim()) { setCustomerResults([]); return }
    let cancelled = false
    ;(async () => {
      const res = await window.electronAPI.customers.search(customerQuery.trim())
      if (cancelled) return
      if (res.success && res.data) setCustomerResults(res.data as CustomerLite[])
    })()
    return () => { cancelled = true }
  }, [mode, smartStep, customerQuery])

  useEffect(() => {
    if (mode !== 'smart' || smartStep !== 3) return
    ;(async () => {
      const res = await window.electronAPI.carBrands.list()
      if (res.success && res.data) setBrands(res.data as BrandLite[])
    })()
  }, [mode, smartStep])

  useEffect(() => {
    if (mode !== 'smart' || smartStep !== 4 || !selectedBrand) return
    ;(async () => {
      const departmentFilter = smartDepartment === 'both' ? undefined : smartDepartment
      const res = await window.electronAPI.serviceCatalog.list({ brand_id: selectedBrand.id, department: departmentFilter })
      if (!res.success || !res.data) return
      const rows = res.data as CatalogService[]
      const models = Array.from(new Set(rows.map(r => r.model?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      setModelOptions(models)
    })()
  }, [mode, smartStep, selectedBrand, smartDepartment])

  useEffect(() => {
    if (mode !== 'smart' || smartStep !== 5 || !selectedBrand || !selectedModel) return
    ;(async () => {
      const departmentFilter = smartDepartment === 'both' ? undefined : smartDepartment
      const res = await window.electronAPI.serviceCatalog.list({
        brand_id: selectedBrand.id,
        model: selectedModel,
        department: departmentFilter,
      })
      if (!res.success || !res.data) return
      const rows = res.data as CatalogService[]
      setCatalogServices(rows.map(r => ({
        id: r.id,
        name: r.service_name,
        sell: String(r.price ?? 0),
        checked: true,
        department: r.department,
      })))
    })()
  }, [mode, smartStep, selectedBrand, selectedModel, smartDepartment])

  useEffect(() => {
    if (mode !== 'smart' || smartStep !== 5 || !selectedVehicle) return
    ;(async () => {
      const res = await window.electronAPI.serviceCatalog.forVehicle(selectedVehicle.make || '', selectedVehicle.model || '')
      if (!res.success || !res.data) return
      const data = res.data as { mechanical: CatalogService[]; programming: CatalogService[] }
      const rows = [...(data.mechanical ?? []), ...(data.programming ?? [])]
      setCatalogServices(rows.map(r => ({
        id: r.id,
        name: r.service_name,
        sell: String(r.price ?? 0),
        checked: true,
        department: r.department,
      })))
    })()
  }, [mode, smartStep, selectedVehicle])

  const filteredEmployees = useMemo(() => {
    const dept = department
    return employees.filter(
      e =>
        !e.department ||
        e.department === 'both' ||
        e.department === dept ||
        dept === 'both',
    )
  }, [employees, department])

  const filteredSmartEmployees = useMemo(() => {
    return employees.filter(
      e =>
        !e.department ||
        e.department === 'both' ||
        e.department === smartDepartment ||
        smartDepartment === 'both',
    )
  }, [employees, smartDepartment])

  useEffect(() => {
    if (!workStartTime || !workEndTime) return
    const [sh, sm] = workStartTime.split(':').map(Number)
    const [eh, em] = workEndTime.split(':').map(Number)
    const diff = eh * 60 + em - (sh * 60 + sm)
    if (diff > 0) {
      setHoursWorked((diff / 60).toFixed(1))
    } else {
      setHoursWorked('')
    }
  }, [workStartTime, workEndTime])

  const subtotal = useMemo(() => {
    const sum = [...mechanical, ...programming].reduce((acc, line) => acc + numberOrZero(line.sell_price), 0)
    return Math.round(sum * 100) / 100
  }, [mechanical, programming])

  const discountValueNum = parseFloat(discountValue) || 0

  const discountAmount =
    discountType === 'percent'
      ? Math.min(subtotal * (discountValueNum / 100), subtotal)
      : discountType === 'fixed'
        ? Math.min(discountValueNum, subtotal)
        : 0

  const finalTotal = subtotal - discountAmount

  function resetForm(): void {
    setDepartment('both')
    setWalkInCustomer(false)
    setWalkInCar(false)
    setPaymentMethod('Cash')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setCustomerAddress('')
    setPlateNumber('')
    setCarCompany('')
    setCarModel('')
    setCarYear('')
    setMechanical([newLine()])
    setProgramming([newLine()])
    setDiscountType('')
    setDiscountValue('')
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
    setSelectedCustomerLoyalty(null)
    setPrimaryEmployeeId(null)
    setAssistantEmployeeId(null)
    setHoursWorked('')
    setWorkStartTime('')
    setWorkEndTime('')
    setInspectionMarkers([])
    setInspectionNotes('')
    setShowInspection(false)
  }

  function resetSmartFlow(): void {
    setSmartStep(1)
    setSmartDepartment('mechanical')
    setCustomerQuery('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setCustomerVehicles([])
    setSelectedVehicle(null)
    setSmartWalkInCustomer(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setBrands([])
    setBrandSearch('')
    setSelectedBrand(null)
    setModelOptions([])
    setSelectedModel('')
    setNewModel('')
    setCatalogServices([])
    setSmartCustomServices([])
    setSmartDiscountType('')
    setSmartDiscountValue('')
    setPaymentMethod('Cash')
    setSelectedCustomerLoyalty(null)
    setPrimaryEmployeeId(null)
    setAssistantEmployeeId(null)
    setHoursWorked('')
    setWorkStartTime('')
    setWorkEndTime('')
    setInspectionMarkers([])
    setInspectionNotes('')
    setShowInspection(false)
  }

  async function handlePrint(receipt: Receipt): Promise<void> {
    try {
      const full = await window.electronAPI.customReceipts.getById(receipt.id) as {
        success: boolean
        data?: Receipt
      }
      const fullData = full.success && full.data ? full.data : receipt

      const loyaltyRawRes = await window.electronAPI.settings.get('loyalty.config')
      const loyaltyRaw =
        loyaltyRawRes.success && loyaltyRawRes.data != null ? loyaltyRawRes.data : ''
      const loyaltyConfig = (() => {
        try {
          return loyaltyRaw ? JSON.parse(loyaltyRaw) : null
        } catch {
          return null
        }
      })() as { enabled?: boolean; showOnReceipt?: boolean } | null

      let printableReceipt: Receipt = {
        ...fullData,
        inspection_data: fullData.inspection_data ?? null,
      }
      if (
        loyaltyConfig?.enabled &&
        loyaltyConfig?.showOnReceipt &&
        printableReceipt.customer_id
      ) {
        try {
          const lr = await window.electronAPI.loyalty.get(
            printableReceipt.customer_id,
            printableReceipt.department || 'all'
          )
          if (lr?.success && lr.data) {
            printableReceipt = {
              ...printableReceipt,
              loyalty_points: lr.data.points,
              loyalty_stamps: lr.data.stamps,
              loyalty_visits: lr.data.total_visits,
            }
          }
        } catch { /* non-fatal */ }
      }

      await printCustomReceiptA4(printableReceipt, { includeSignatures })
    } catch (e) {
      console.error('Receipt print failed', e)
      toast.error(t('common.error'))
    }
  }

  async function offerPrintAfterSave(fullReceiptData: Receipt): Promise<void> {
    const progMode = await window.electronAPI.settings.get('receipt.programming_print_mode')
    const mode = progMode?.data ?? 'a4_only'
    const isProgramming =
      fullReceiptData.department === 'programming' ||
      fullReceiptData.department === 'both'
    if (isProgramming && mode === 'a4_or_thermal') {
      setPendingPrintReceipt(fullReceiptData)
      setPrintChoiceOpen(true)
    } else {
      await handlePrint(fullReceiptData)
    }
  }

  async function handlePrintA4(): Promise<void> {
    if (!pendingPrintReceipt) return
    setPrintChoiceOpen(false)
    await handlePrint(pendingPrintReceipt)
    setPendingPrintReceipt(null)
  }

  async function handlePrintThermal(): Promise<void> {
    if (!pendingPrintReceipt) return
    setThermalPrinting(true)
    try {
      const html = await buildThermalHtml(pendingPrintReceipt)
      const printerRes = await window.electronAPI.settings.get('printer.name')
      const printerName = printerRes?.data ?? ''
      if (!printerName) {
        toast.error(
          'No thermal printer configured. ' +
            'Set it in Settings → Invoice Settings.'
        )
        return
      }
      await window.electronAPI.print.thermal(html, printerName)
    } catch {
      toast.error('Thermal print failed')
    } finally {
      setThermalPrinting(false)
      setPrintChoiceOpen(false)
      setPendingPrintReceipt(null)
    }
  }

  async function handlePrintBoth(): Promise<void> {
    if (!pendingPrintReceipt) return
    setPrintChoiceOpen(false)
    await handlePrint(pendingPrintReceipt)
    await handlePrintThermal()
    setPendingPrintReceipt(null)
  }

  async function handleDelete(): Promise<void> {
    if (deleteId == null) return
    const res = await window.electronAPI.customReceipts.delete(deleteId)
    setDeleteId(null)
    if (!res.success) {
      toast.error(res.error || t('common.error'))
      return
    }
    toast.success(t('common.deleted'))
    void load()
  }

  async function saveReceipt(andPrint: boolean): Promise<void> {
    if (!canCreate) return
    const effectiveMechanical = department === 'programming' ? [] : cleanLines(mechanical)
    const effectiveProgramming = department === 'mechanical' ? [] : cleanLines(programming)
    const effectiveDepartment =
      effectiveMechanical.length > 0 && effectiveProgramming.length > 0
        ? 'both'
        : effectiveMechanical.length > 0
          ? 'mechanical'
          : 'programming'
    if (effectiveMechanical.length + effectiveProgramming.length === 0) {
      toast.error(t('customReceipts.errorServiceRequired', { defaultValue: 'Add at least one service line' }))
      return
    }
    if (!paymentMethod) {
      toast.error(t('customReceipts.paymentMethodRequired', { defaultValue: 'Payment method is required' }))
      return
    }
    setSaving(true)
    try {
      const payload = {
        department: effectiveDepartment,
        customer_name: walkInCustomer ? 'Walk-in Customer' : (customerName.trim() || 'Walk-in Customer'),
        customer_phone: walkInCustomer ? null : (customerPhone.trim() || null),
        customer_email: walkInCustomer ? null : (customerEmail.trim() || null),
        customer_address: walkInCustomer ? null : (customerAddress.trim() || null),
        plate_number: walkInCar ? null : (plateNumber.trim() || null),
        car_company: walkInCar ? 'Walk-in' : (carCompany.trim() || null),
        car_model: walkInCar ? null : (carModel.trim() || null),
        car_year: walkInCar ? null : (carYear.trim() || null),
        mechanical_services: effectiveMechanical,
        programming_services: effectiveProgramming,
        discount_type: discountType || null,
        discount_value: discountValueNum,
        discount_amount: discountAmount,
        amount: finalTotal,
        payment_method: paymentMethod,
        notes: null,
        primary_employee_id: primaryEmployeeId ?? undefined,
        assistant_employee_id: assistantEmployeeId ?? undefined,
        hours_worked: parseFloat(hoursWorked) || undefined,
        work_start_time: workStartTime || undefined,
        work_end_time: workEndTime || undefined,
        inspection_data:
          inspectionMarkers.length > 0
            ? JSON.stringify({
                markers: inspectionMarkers,
                notes: inspectionNotes,
              })
            : undefined,
      }
      const createRes = await window.electronAPI.customReceipts.create(payload) as {
        success: boolean
        data?: { id: number }
        error?: string
      }
      if (!createRes.success || !createRes.data) {
        toast.error(createRes.error || t('common.error'))
        return
      }
      if (andPrint) {
        const full = await window.electronAPI.customReceipts.getById(createRes.data.id) as {
          success: boolean
          data?: Receipt
        }
        if (full.success && full.data) await offerPrintAfterSave(full.data)
      }
      toast.success(t('common.saved'))
      resetForm()
      setMode('list')
      void load()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
  const labelCls = 'block text-sm font-medium text-foreground mb-1'

  const loyaltyWidget: ReactNode = useMemo(() => {
    if (!selectedCustomerLoyalty || !loyaltyCfgCache?.enabled) return null
    return (
      <LoyaltySummaryWidget
        selectedCustomerLoyalty={selectedCustomerLoyalty}
        loyaltyCfgCache={loyaltyCfgCache}
        customerIdFallback={selectedCustomer?.id ?? null}
        userId={user?.userId}
        setSelectedCustomerLoyalty={setSelectedCustomerLoyalty}
      />
    )
  }, [selectedCustomerLoyalty, loyaltyCfgCache, selectedCustomer?.id, user?.userId])

  return (
    <div>
      {mode === 'list' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold text-foreground">{t('customReceipts.title', { defaultValue: 'Custom Receipts' })}</h1>
            {canCreate && (
              <button
                onClick={() => setMode('custom')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                {t('customReceipts.newRecipe', { defaultValue: 'New Recipe' })}
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 mb-4 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-input"
              checked={includeSignatures}
              onChange={e => setIncludeSignatures(e.target.checked)}
            />
            Include Signatures (A4, inspection block)
            <span className="text-xs opacity-70">Ctrl+Shift+I when print or view dialog is open</span>
          </label>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.date')}</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.customerName')}</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.carInfo', { defaultValue: 'Car' })}</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.department', { defaultValue: 'Department' })}</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.amount')}</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t('common.noData')}</td>
                      </tr>
                    ) : (
                      receipts.map(r => (
                        <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                          <td className="px-4 py-3">{r.customer_name}</td>
                          <td className="px-4 py-3">{[r.plate_number, r.car_company, r.car_model].filter(Boolean).join(' • ') || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {prettyDepartment(r.department)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium"><CurrencyText amount={r.amount} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setViewReceipt(r)}
                                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title={t('common.view', { defaultValue: 'View' })}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => void handlePrint(r)}
                                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title={t('customReceipts.printReceipt')}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => setDeleteId(r.id)}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  title={t('common.delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border text-sm text-muted-foreground">
                {total} {t('customReceipts.title').toLowerCase()}
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'custom' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => { setMode('list'); setSearchParams({}) }} className="p-2 rounded-md border border-border hover:bg-accent" title={t('common.back', { defaultValue: 'Back' })}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-2xl font-bold text-foreground">{t('customReceipts.customRecipe', { defaultValue: 'Custom Recipe' })}</h1>
            </div>
            <div className="w-56">
              <label className={labelCls}>{t('customReceipts.department', { defaultValue: 'Department' })}</label>
              <select className={inputCls} value={department} onChange={e => setDepartment(e.target.value as Department)}>
                <option value="mechanical">{t('customReceipts.mechanical', { defaultValue: 'Mechanical' })}</option>
                <option value="programming">{t('customReceipts.programming', { defaultValue: 'Programming' })}</option>
                <option value="both">{t('customReceipts.both', { defaultValue: 'Both' })}</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={walkInCustomer}
                  onChange={e => {
                    setWalkInCustomer(e.target.checked)
                    if (e.target.checked) {
                      setSelectedCustomer(null)
                      setSelectedCustomerLoyalty(null)
                    }
                  }}
                  className="h-4 w-4 rounded border-border"
                />
                {t('customReceipts.walkInCustomer', { defaultValue: 'Walk-in Customer' })}
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={walkInCar}
                  onChange={e => setWalkInCar(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {t('customReceipts.walkInCar', { defaultValue: 'Walk-in Car' })}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {!walkInCustomer && (
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-base font-semibold mb-4">{t('customReceipts.customerInfo', { defaultValue: 'Customer Info' })}</h2>
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className={labelCls}>{t('common.search', { defaultValue: 'Search customer' })}</label>
                        <input
                          className={inputCls}
                          value={customerQuery}
                          onChange={e => setCustomerQuery(e.target.value)}
                          placeholder={t('customReceipts.searchCustomerPlaceholder', { defaultValue: 'Name or phone' })}
                        />
                        <div className="mt-2 space-y-1 max-h-48 overflow-auto">
                          {customerResults.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className={`w-full text-left px-3 py-2 rounded border text-sm ${selectedCustomer?.id === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}
                              onClick={() => {
                                setSelectedCustomer(c)
                                setCustomerName(c.name)
                                setCustomerPhone(c.phone ?? '')
                              }}
                            >
                              <p className="font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.phone || '—'}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div><label className={labelCls}>{t('employees.fullName', { defaultValue: 'Full Name' })}</label><input className={inputCls} value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('employees.phone', { defaultValue: 'Phone Number' })}</label><input className={inputCls} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('employees.email', { defaultValue: 'Email' })}</label><input className={inputCls} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('employees.address', { defaultValue: 'Address' })}</label><input className={inputCls} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} /></div>
                    </div>
                  </section>
                )}

                {!walkInCar && (
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-base font-semibold mb-4">{t('customReceipts.carDetails', { defaultValue: 'Car Info' })}</h2>
                    <div className="space-y-3">
                      <div><label className={labelCls}>{t('customReceipts.plateNumber')}</label><input className={inputCls} value={plateNumber} onChange={e => setPlateNumber(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('customReceipts.company', { defaultValue: 'Company (Brand)' })}</label><input className={inputCls} value={carCompany} onChange={e => setCarCompany(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('customReceipts.model', { defaultValue: 'Model' })}</label><input className={inputCls} value={carModel} onChange={e => setCarModel(e.target.value)} /></div>
                      <div><label className={labelCls}>{t('customReceipts.year', { defaultValue: 'Year' })}</label><input className={inputCls} value={carYear} onChange={e => setCarYear(e.target.value)} /></div>
                    </div>
                  </section>
                )}
              </div>

              <CarInspectionPanel
                showInspection={showInspection}
                setShowInspection={setShowInspection}
                inspectionMarkers={inspectionMarkers}
                setInspectionMarkers={setInspectionMarkers}
                inspectionNotes={inspectionNotes}
                setInspectionNotes={setInspectionNotes}
                selectedMarkerType={selectedMarkerType}
                setSelectedMarkerType={setSelectedMarkerType}
                t={t}
              />

              {(department === 'mechanical' || department === 'both') && (
                <ServiceSection
                  title={t('customReceipts.mechanicalServices', { defaultValue: 'Mechanical Services' })}
                  lines={mechanical}
                  onAdd={() => setMechanical(prev => [...prev, newLine()])}
                  onRemove={(id) => setMechanical(prev => prev.filter(line => line.id !== id))}
                  onUpdate={(id, field, value) => setMechanical(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line))}
                />
              )}

              {(department === 'programming' || department === 'both') && (
                <ServiceSection
                  title={t('customReceipts.programmingServices', { defaultValue: 'Programming Services' })}
                  lines={programming}
                  onAdd={() => setProgramming(prev => [...prev, newLine()])}
                  onRemove={(id) => setProgramming(prev => prev.filter(line => line.id !== id))}
                  onUpdate={(id, field, value) => setProgramming(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line))}
                />
              )}
            </div>

            <div className="xl:col-span-1">
              <div className="rounded-lg border border-border bg-card p-4 space-y-4 sticky top-4">
                <h3 className="text-base font-semibold">{t('customReceipts.summary', { defaultValue: 'Summary' })}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('customReceipts.department', { defaultValue: 'Department' })}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{prettyDepartment(department)}</span>
                </div>
                {filteredEmployees.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground">Assigned Employee</p>
                    <select
                      value={primaryEmployeeId ?? ''}
                      onChange={e => setPrimaryEmployeeId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="">— Primary technician</option>
                      {filteredEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.employee_id})
                        </option>
                      ))}
                    </select>
                    <select
                      value={assistantEmployeeId ?? ''}
                      onChange={e => setAssistantEmployeeId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="">— Assistant (optional)</option>
                      {filteredEmployees
                        .filter(e => e.id !== primaryEmployeeId)
                        .map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name} ({emp.employee_id})
                          </option>
                        ))}
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">Start</label>
                        <input
                          type="time"
                          value={workStartTime}
                          onChange={e => setWorkStartTime(e.target.value)}
                          className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">End</label>
                        <input
                          type="time"
                          value={workEndTime}
                          onChange={e => setWorkEndTime(e.target.value)}
                          className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                        />
                      </div>
                    </div>
                    {hoursWorked ? (
                      <p className="text-xs text-primary font-medium">⏱ {hoursWorked} hours worked</p>
                    ) : null}
                  </div>
                )}
                {loyaltyWidget}
                <div>
                  <label className={labelCls}>{t('customReceipts.paymentMethod', { defaultValue: 'Payment Method' })}</label>
                  <select className={inputCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'Cash' | 'Card' | 'Bank Transfer')}>
                    <option value="Cash">{t('customReceipts.cash', { defaultValue: 'Cash' })}</option>
                    <option value="Card">{t('customReceipts.card', { defaultValue: 'Card' })}</option>
                    <option value="Bank Transfer">{t('customReceipts.transfer', { defaultValue: 'Bank Transfer' })}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Discount</label>
                  <div className="flex gap-2">
                    <select
                      className={`${inputCls} flex-1 min-w-0`}
                      value={discountType}
                      onChange={e => {
                        const v = e.target.value as '' | 'percent' | 'fixed'
                        setDiscountType(v)
                        setDiscountValue('')
                      }}
                    >
                      <option value="">No Discount</option>
                      <option value="percent">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (AED)</option>
                    </select>
                    {discountType !== '' && (
                      <input
                        type="number"
                        min="0"
                        className={`${inputCls} flex-1 min-w-0`}
                        placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 20'}
                        value={discountValue}
                        onChange={e => setDiscountValue(e.target.value)}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>{t('customReceipts.subtotal', { defaultValue: 'Subtotal' })}</span>
                  <CurrencyText amount={subtotal} />
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Discount</span>
                    <span className="text-red-600">- AED {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>Total</span>
                  <CurrencyText amount={finalTotal} />
                </div>
                <button onClick={() => void saveReceipt(true)} disabled={saving} className="w-full px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {t('customReceipts.createAndPrint', { defaultValue: 'Save & Print' })}
                </button>
                <button onClick={() => void saveReceipt(false)} disabled={saving} className="w-full px-4 py-2 text-sm rounded-md border border-border hover:bg-accent disabled:opacity-60">
                  {t('customReceipts.saveOnly', { defaultValue: 'Save Only' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'smart' && (
        <SmartRecipeWizard
          t={t}
          step={smartStep}
          setStep={setSmartStep}
          department={smartDepartment}
          setDepartment={setSmartDepartment}
          loadCustomerLoyalty={loadCustomerLoyalty}
          clearLoyaltyOnWalkIn={() => setSelectedCustomerLoyalty(null)}
          loyaltyWidget={loyaltyWidget}
          customerQuery={customerQuery}
          setCustomerQuery={setCustomerQuery}
          customerResults={customerResults}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          customerVehicles={customerVehicles}
          setCustomerVehicles={setCustomerVehicles}
          selectedVehicle={selectedVehicle}
          setSelectedVehicle={setSelectedVehicle}
          walkInCustomer={smartWalkInCustomer}
          setWalkInCustomer={setSmartWalkInCustomer}
          newCustomerName={newCustomerName}
          setNewCustomerName={setNewCustomerName}
          newCustomerPhone={newCustomerPhone}
          setNewCustomerPhone={setNewCustomerPhone}
          brands={brands}
          brandSearch={brandSearch}
          setBrandSearch={setBrandSearch}
          selectedBrand={selectedBrand}
          setSelectedBrand={setSelectedBrand}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          newModel={newModel}
          setNewModel={setNewModel}
          catalogServices={catalogServices}
          setCatalogServices={setCatalogServices}
          customServices={smartCustomServices}
          setCustomServices={setSmartCustomServices}
          smartDiscountType={smartDiscountType}
          setSmartDiscountType={setSmartDiscountType}
          smartDiscountValue={smartDiscountValue}
          setSmartDiscountValue={setSmartDiscountValue}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          filteredSmartEmployees={filteredSmartEmployees}
          primaryEmployeeId={primaryEmployeeId}
          setPrimaryEmployeeId={setPrimaryEmployeeId}
          assistantEmployeeId={assistantEmployeeId}
          setAssistantEmployeeId={setAssistantEmployeeId}
          workStartTime={workStartTime}
          setWorkStartTime={setWorkStartTime}
          workEndTime={workEndTime}
          setWorkEndTime={setWorkEndTime}
          hoursWorked={hoursWorked}
          showInspection={showInspection}
          setShowInspection={setShowInspection}
          inspectionMarkers={inspectionMarkers}
          setInspectionMarkers={setInspectionMarkers}
          inspectionNotes={inspectionNotes}
          setInspectionNotes={setInspectionNotes}
          selectedMarkerType={selectedMarkerType}
          setSelectedMarkerType={setSelectedMarkerType}
          onLoadVehicles={async (customerId: number) => {
            const vres = await window.electronAPI.vehicles.list({ owner_id: customerId, page: 1, pageSize: 100 })
            if (vres.success && vres.data) {
              const d = vres.data as { items: VehicleLite[] }
              setCustomerVehicles(d.items || [])
            }
          }}
          onCreateCustomer={async () => {
            if (!newCustomerName.trim()) return null
            const cres = await window.electronAPI.customers.create({
              name: newCustomerName.trim(),
              phone: newCustomerPhone.trim() || null,
              balance: 0,
            })
            if (!cres.success || !cres.data) return null
            const data = cres.data as { id: number }
            const created: CustomerLite = { id: data.id, name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null }
            setSelectedCustomer(created)
            setCustomerVehicles([])
            void loadCustomerLoyalty(created.id, deptParamForLoyalty(smartDepartment))
            return created
          }}
          onSave={async (andPrint: boolean) => {
            const selectedCatalog = catalogServices.filter(s => s.checked)
            const mappedCatalog = selectedCatalog.map(s => ({
              service_name: s.name,
              cost: 0,
              sell_price: numberOrZero(s.sell),
              department: s.department,
            }))
            const mappedCustom = cleanSmartCustomLines(smartCustomServices)
            const merged = [...mappedCatalog, ...mappedCustom]
            if (merged.length === 0) {
              toast.error(t('customReceipts.errorServiceRequired', { defaultValue: 'Add at least one service line' }))
              return
            }
            const subtotalSmart = Math.round(merged.reduce((a, b) => a + b.sell_price, 0) * 100) / 100
            const smartDiscountValueNum = parseFloat(smartDiscountValue) || 0
            const smartDiscountAmount =
              smartDiscountType === 'percent'
                ? Math.min(subtotalSmart * (smartDiscountValueNum / 100), subtotalSmart)
                : smartDiscountType === 'fixed'
                  ? Math.min(smartDiscountValueNum, subtotalSmart)
                  : 0
            const smartFinalTotal = subtotalSmart - smartDiscountAmount
            const mech = merged.filter(s => s.department === 'mechanical').map(({ service_name, cost, sell_price }) => ({ service_name, cost, sell_price }))
            const prog = merged.filter(s => s.department === 'programming').map(({ service_name, cost, sell_price }) => ({ service_name, cost, sell_price }))
            const effectiveSmartDepartment =
              mech.length > 0 && prog.length > 0
                ? 'both'
                : mech.length > 0
                  ? 'mechanical'
                  : 'programming'
            if (mech.length + prog.length === 0) {
              toast.error('Assign a department for at least one service')
              return
            }

            let customer = selectedCustomer
            if (!smartWalkInCustomer && !customer && newCustomerName.trim()) {
              const cres = await window.electronAPI.customers.create({
                name: newCustomerName.trim(),
                phone: newCustomerPhone.trim() || null,
                balance: 0,
              })
              if (cres.success && cres.data) {
                const d = cres.data as { id: number }
                customer = { id: d.id, name: newCustomerName.trim(), phone: newCustomerPhone.trim() || null }
                setSelectedCustomer(customer)
              }
            }

            let vehicle = selectedVehicle
            const carModelValue = selectedVehicle?.model ?? (selectedModel || newModel || null)
            const carBrandValue = selectedVehicle?.make ?? selectedBrand?.name ?? null
            const carYearValue = selectedVehicle?.year != null ? String(selectedVehicle.year) : null
            if (!vehicle && customer && carBrandValue && carModelValue) {
              const vres = await window.electronAPI.vehicles.create({
                owner_id: customer.id,
                make: carBrandValue,
                model: carModelValue,
                year: carYearValue ? Number(carYearValue) : null,
              })
              if (vres.success && vres.data) {
                const d = vres.data as { id: number }
                vehicle = {
                  id: d.id,
                  make: carBrandValue,
                  model: carModelValue,
                  year: carYearValue ? Number(carYearValue) : null,
                  license_plate: null,
                }
                setSelectedVehicle(vehicle)
              }
            }

            // If a new model was entered, persist selected services under this brand/model for future reuse.
            if (newModel.trim() && selectedBrand) {
              for (const line of merged) {
                await window.electronAPI.serviceCatalog.create({
                  brand_id: selectedBrand.id,
                  model: newModel.trim(),
                  service_name: line.service_name,
                  department: line.department,
                  price: line.sell_price,
                  active: true,
                })
              }
            }

            const plate = vehicle?.license_plate ?? null
            const payload = {
              department: effectiveSmartDepartment,
                customer_name: smartWalkInCustomer
                  ? 'Walk-in Customer'
                  : ((customer?.name ?? newCustomerName.trim()) || 'Walk-in Customer'),
                customer_phone: smartWalkInCustomer
                  ? null
                  : ((customer?.phone ?? newCustomerPhone.trim()) || null),
              customer_email: null,
              customer_address: null,
              plate_number: plate,
              car_company: carBrandValue,
              car_model: carModelValue,
              car_year: carYearValue,
              mechanical_services: mech,
              programming_services: prog,
              discount_type: smartDiscountType || null,
              discount_value: smartDiscountValueNum,
              discount_amount: smartDiscountAmount,
              amount: smartFinalTotal,
              payment_method: paymentMethod,
              smart_recipe: true,
              notes: null,
              primary_employee_id: primaryEmployeeId ?? undefined,
              assistant_employee_id: assistantEmployeeId ?? undefined,
              hours_worked: parseFloat(hoursWorked) || undefined,
              work_start_time: workStartTime || undefined,
              work_end_time: workEndTime || undefined,
              inspection_data:
                inspectionMarkers.length > 0
                  ? JSON.stringify({
                      markers: inspectionMarkers,
                      notes: inspectionNotes,
                    })
                  : undefined,
            }
            const res = await window.electronAPI.customReceipts.create(payload) as { success: boolean; data?: { id: number }; error?: string }
            if (!res.success || !res.data) {
              toast.error(res.error || t('common.error'))
              return
            }
            if (andPrint) {
              const full = await window.electronAPI.customReceipts.getById(res.data.id) as { success: boolean; data?: Receipt }
              if (full.success && full.data) await offerPrintAfterSave(full.data)
            }
            toast.success(t('common.saved'))
            resetSmartFlow()
            setMode('list')
            void load()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteId != null}
        title={t('common.delete')}
        message={
          deleteId != null
            ? `Are you sure you want to delete invoice ${receipts.find(r => r.id === deleteId)?.receipt_number ?? ''}? This action cannot be undone.`
            : ''
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />

      <Modal
        open={viewReceipt != null}
        title={viewReceipt?.receipt_number || t('common.view')}
        onClose={() => setViewReceipt(null)}
        size="md"
      >
        {viewReceipt && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">{t('common.date')}:</span> {formatDate(viewReceipt.created_at)}</div>
              <div><span className="text-muted-foreground">{t('customReceipts.department', { defaultValue: 'Department' })}:</span> {prettyDepartment(viewReceipt.department)}</div>
            </div>
            <div><span className="text-muted-foreground">{t('customReceipts.customerName')}:</span> {viewReceipt.customer_name || '—'}</div>
            <div><span className="text-muted-foreground">{t('customReceipts.carInfo', { defaultValue: 'Car' })}:</span> {[viewReceipt.plate_number, viewReceipt.car_company, viewReceipt.car_model, viewReceipt.car_year].filter(Boolean).join(' • ') || '—'}</div>
            <div>
              <p className="font-medium mb-2">{t('customReceipts.servicesDescription', { defaultValue: 'Services' })}</p>
              <div className="rounded border border-border overflow-hidden">
                {parseLines(viewReceipt).map((line, idx) => (
                  <div key={idx} className="px-3 py-2 border-b border-border last:border-b-0 flex items-center justify-between">
                    <span>{line.service_name}</span>
                    <CurrencyText amount={line.sell_price} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('customReceipts.subtotal', { defaultValue: 'Subtotal' })}</span>
              <CurrencyText amount={viewReceipt.amount} />
            </div>
          </div>
        )}
      </Modal>

      {printChoiceOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="font-semibold text-base">Print Receipt</h3>
            <p className="text-sm text-muted-foreground">
              Choose print format for this Programming receipt.
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={includeSignatures}
                onChange={e => setIncludeSignatures(e.target.checked)}
              />
              Include Signatures on A4 (inspection)
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handlePrintA4()}
                className="w-full py-2.5 px-4 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 text-left"
              >
                🖨️ Print A4 (PDF)
              </button>
              <button
                type="button"
                onClick={() => void handlePrintThermal()}
                disabled={thermalPrinting}
                className="w-full py-2.5 px-4 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 text-left disabled:opacity-50"
              >
                🧾 Print Thermal (80mm)
                {thermalPrinting && ' — printing...'}
              </button>
              <button
                type="button"
                onClick={() => void handlePrintBoth()}
                disabled={thermalPrinting}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 text-left disabled:opacity-50"
              >
                🖨️🧾 Print Both
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrintChoiceOpen(false)
                setPendingPrintReceipt(null)
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Skip printing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LoyaltySummaryWidget({
  selectedCustomerLoyalty,
  loyaltyCfgCache,
  customerIdFallback,
  userId,
  setSelectedCustomerLoyalty,
}: {
  selectedCustomerLoyalty: SelectedCustomerLoyalty
  loyaltyCfgCache: LoyaltyCfgCache
  customerIdFallback: number | null
  userId: number | undefined
  setSelectedCustomerLoyalty: Dispatch<SetStateAction<SelectedCustomerLoyalty | null>>
}): JSX.Element {
  const dept = selectedCustomerLoyalty.department as 'all' | 'mechanical' | 'programming'
  const redeemCustomerId = selectedCustomerLoyalty.customer_id || customerIdFallback
  return (
    <div className="border border-border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold">🏆 Loyalty</span>
        {(loyaltyCfgCache.type === 'points' || loyaltyCfgCache.type === 'all') && (
          <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
            {selectedCustomerLoyalty.points} {loyaltyCfgCache.pointsLabel}
          </span>
        )}
        {(loyaltyCfgCache.type === 'stamps' || loyaltyCfgCache.type === 'all') && (
          <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full">
            🎫 {selectedCustomerLoyalty.stamps}/{loyaltyCfgCache.stampsForReward}
          </span>
        )}
      </div>
      {(loyaltyCfgCache.type === 'stamps' || loyaltyCfgCache.type === 'all') &&
        selectedCustomerLoyalty.stamps >= loyaltyCfgCache.stampsForReward - 1 &&
        selectedCustomerLoyalty.stamps < loyaltyCfgCache.stampsForReward && (
        <p className="text-xs text-amber-600 font-medium">⚠️ 1 stamp away from a reward!</p>
      )}
      {(loyaltyCfgCache.type === 'stamps' || loyaltyCfgCache.type === 'all') &&
        selectedCustomerLoyalty.stamps >= loyaltyCfgCache.stampsForReward && (
        <div className="space-y-1">
          <p className="text-xs text-green-600 font-medium">
            🎉 Reward earned: {loyaltyCfgCache.stampRewardDesc}
          </p>
          <button
            type="button"
            onClick={async () => {
              if (redeemCustomerId == null || userId == null) return
              try {
                await window.electronAPI.loyalty.redeemReward({
                  customer_id: redeemCustomerId,
                  department: dept,
                  note: 'Reward redeemed at checkout',
                  created_by: userId,
                })
                setSelectedCustomerLoyalty(prev =>
                  prev ? { ...prev, stamps: 0 } : null
                )
              } catch { /* non-fatal */ }
            }}
            className="w-full text-xs py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Apply Reward
          </button>
        </div>
      )}
    </div>
  )
}

function ServiceSection({
  title,
  lines,
  onAdd,
  onRemove,
  onUpdate,
}: {
  title: string
  lines: ServiceLine[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Pick<ServiceLine, 'service_name' | 'cost' | 'sell_price'>, value: string) => void
}): JSX.Element {
  const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="hidden md:grid md:grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
        <div className="md:col-span-5">Service Name</div>
        <div className="md:col-span-2">Cost (internal)</div>
        <div className="md:col-span-2">Sell Price</div>
        <div className="md:col-span-1" />
      </div>
      {lines.map(line => (
        <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input className={`${inputCls} md:col-span-5`} placeholder="Service name" value={line.service_name} onChange={e => onUpdate(line.id, 'service_name', e.target.value)} />
          <input className={`${inputCls} md:col-span-2`} type="number" min="0" step="0.01" value={line.cost} onChange={e => onUpdate(line.id, 'cost', e.target.value)} />
          <input className={`${inputCls} md:col-span-2`} type="number" min="0" step="0.01" value={line.sell_price} onChange={e => onUpdate(line.id, 'sell_price', e.target.value)} />
          <button onClick={() => onRemove(line.id)} className="md:col-span-1 px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mx-auto" />
          </button>
        </div>
      ))}
      <button onClick={onAdd} className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent">
        + Add Service
      </button>
    </section>
  )
}

function SmartCustomServiceSection({
  lines,
  onAdd,
  onRemove,
  onUpdate,
}: {
  lines: SmartCustomServiceLine[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (
    id: string,
    field: keyof Pick<SmartCustomServiceLine, 'service_name' | 'cost' | 'sell_price' | 'department'>,
    value: string
  ) => void
}): JSX.Element {
  const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Custom services</h3>
      <div className="hidden md:grid md:grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
        <div className="md:col-span-4">Service Name</div>
        <div className="md:col-span-2">Department</div>
        <div className="md:col-span-2">Cost (Internal)</div>
        <div className="md:col-span-2">Sell Price</div>
        <div className="md:col-span-1" />
      </div>
      {lines.map(line => (
        <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input className={`${inputCls} md:col-span-4`} placeholder="Service name" value={line.service_name} onChange={e => onUpdate(line.id, 'service_name', e.target.value)} />
          <select className={`${inputCls} md:col-span-2`} value={line.department} onChange={e => onUpdate(line.id, 'department', e.target.value)}>
            <option value="mechanical">Mechanical</option>
            <option value="programming">Programming</option>
          </select>
          <input className={`${inputCls} md:col-span-2`} type="number" min="0" step="0.01" value={line.cost} onChange={e => onUpdate(line.id, 'cost', e.target.value)} />
          <input className={`${inputCls} md:col-span-2`} type="number" min="0" step="0.01" value={line.sell_price} onChange={e => onUpdate(line.id, 'sell_price', e.target.value)} />
          <button onClick={() => onRemove(line.id)} className="md:col-span-1 px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mx-auto" />
          </button>
        </div>
      ))}
      <button onClick={onAdd} className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent">
        + Add custom service
      </button>
    </section>
  )
}

function SmartRecipeWizard(props: {
  t: (k: string, o?: { defaultValue: string }) => string
  step: WizardStep
  setStep: (s: WizardStep) => void
  department: Department
  setDepartment: (d: Department) => void
  customerQuery: string
  setCustomerQuery: (v: string) => void
  customerResults: CustomerLite[]
  selectedCustomer: CustomerLite | null
  setSelectedCustomer: (v: CustomerLite | null) => void
  customerVehicles: VehicleLite[]
  setCustomerVehicles: (v: VehicleLite[]) => void
  selectedVehicle: VehicleLite | null
  setSelectedVehicle: (v: VehicleLite | null) => void
  walkInCustomer: boolean
  setWalkInCustomer: (v: boolean) => void
  newCustomerName: string
  setNewCustomerName: (v: string) => void
  newCustomerPhone: string
  setNewCustomerPhone: (v: string) => void
  brands: BrandLite[]
  brandSearch: string
  setBrandSearch: (v: string) => void
  selectedBrand: BrandLite | null
  setSelectedBrand: (v: BrandLite | null) => void
  modelOptions: string[]
  selectedModel: string
  setSelectedModel: (v: string) => void
  newModel: string
  setNewModel: (v: string) => void
  catalogServices: Array<{ id: number; name: string; sell: string; checked: boolean; department: 'mechanical' | 'programming' }>
  setCatalogServices: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; sell: string; checked: boolean; department: 'mechanical' | 'programming' }>>>
  customServices: SmartCustomServiceLine[]
  setCustomServices: React.Dispatch<React.SetStateAction<SmartCustomServiceLine[]>>
  smartDiscountType: 'percent' | 'fixed' | ''
  setSmartDiscountType: (v: 'percent' | 'fixed' | '') => void
  smartDiscountValue: string
  setSmartDiscountValue: (v: string) => void
  paymentMethod: 'Cash' | 'Card' | 'Bank Transfer'
  setPaymentMethod: (v: 'Cash' | 'Card' | 'Bank Transfer') => void
  onLoadVehicles: (customerId: number) => Promise<void>
  onCreateCustomer: () => Promise<CustomerLite | null>
  onSave: (andPrint: boolean) => Promise<void>
  loadCustomerLoyalty: (customerId: number, dept?: 'mechanical' | 'programming') => void
  clearLoyaltyOnWalkIn: () => void
  loyaltyWidget: ReactNode
  filteredSmartEmployees: ReceiptEmployeePickerRow[]
  primaryEmployeeId: number | null
  setPrimaryEmployeeId: (v: number | null) => void
  assistantEmployeeId: number | null
  setAssistantEmployeeId: (v: number | null) => void
  workStartTime: string
  setWorkStartTime: (v: string) => void
  workEndTime: string
  setWorkEndTime: (v: string) => void
  hoursWorked: string
  showInspection: boolean
  setShowInspection: Dispatch<SetStateAction<boolean>>
  inspectionMarkers: InspectionMarker[]
  setInspectionMarkers: Dispatch<SetStateAction<InspectionMarker[]>>
  inspectionNotes: string
  setInspectionNotes: Dispatch<SetStateAction<string>>
  selectedMarkerType: InspectionMarkerType
  setSelectedMarkerType: Dispatch<SetStateAction<InspectionMarkerType>>
}): JSX.Element {
  const {
    t, step, setStep, department, setDepartment,
    customerQuery, setCustomerQuery, customerResults, selectedCustomer, setSelectedCustomer,
    customerVehicles, selectedVehicle, setSelectedVehicle, walkInCustomer, setWalkInCustomer,
    newCustomerName, setNewCustomerName, newCustomerPhone, setNewCustomerPhone,
    brands, brandSearch, setBrandSearch, selectedBrand, setSelectedBrand,
    modelOptions, selectedModel, setSelectedModel, newModel, setNewModel,
    catalogServices, setCatalogServices, customServices, setCustomServices,
    smartDiscountType, setSmartDiscountType, smartDiscountValue, setSmartDiscountValue,
    paymentMethod, setPaymentMethod, onLoadVehicles, onCreateCustomer, onSave,
    loadCustomerLoyalty, clearLoyaltyOnWalkIn, loyaltyWidget,
    filteredSmartEmployees,
    primaryEmployeeId,
    setPrimaryEmployeeId,
    assistantEmployeeId,
    setAssistantEmployeeId,
    workStartTime,
    setWorkStartTime,
    workEndTime,
    setWorkEndTime,
    hoursWorked,
    showInspection,
    setShowInspection,
    inspectionMarkers,
    setInspectionMarkers,
    inspectionNotes,
    setInspectionNotes,
    selectedMarkerType,
    setSelectedMarkerType,
  } = props
  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
  const chosenModel = selectedModel || newModel
  const selectedLines = [
    ...catalogServices.filter(s => s.checked).map(s => ({ service_name: s.name, sell_price: numberOrZero(s.sell) })),
    ...cleanSmartCustomLines(customServices).map(s => ({ service_name: s.service_name, sell_price: s.sell_price })),
  ]
  const subtotal = Math.round(selectedLines.reduce((a, b) => a + b.sell_price, 0) * 100) / 100
  const smartDiscountValueNum = parseFloat(smartDiscountValue) || 0
  const smartDiscountAmount =
    smartDiscountType === 'percent'
      ? Math.min(subtotal * (smartDiscountValueNum / 100), subtotal)
      : smartDiscountType === 'fixed'
        ? Math.min(smartDiscountValueNum, subtotal)
        : 0
  const smartFinalTotal = subtotal - smartDiscountAmount
  const smartLabelCls = 'block text-sm font-medium text-foreground mb-1'
  const smartInputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
  const handleHeaderBack = (): void => {
    if (step === 5) { setStep(4); return }
    if (step === 4) { setStep(3); return }
    if (step === 3) { setStep(2); return }
    if (step === 2) { setStep(1); return }
    // Step 1: stay in wizard.
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={handleHeaderBack} className="p-2 rounded-md border border-border hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-2xl font-bold">{t('customReceipts.smartRecipe', { defaultValue: 'Smart Recipe' })}</h1>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full grid place-items-center border ${step >= n ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>{n}</span>
            {n < 5 && <ChevronRight className="w-3 h-3" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className={`rounded-lg border p-6 text-left hover:bg-accent ${department === 'mechanical' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => setDepartment('mechanical')}>
            <Wrench className="w-7 h-7 mb-3" />
            <p className="font-semibold">{t('customReceipts.mechanical', { defaultValue: 'Mechanical' })}</p>
          </button>
          <button className={`rounded-lg border p-6 text-left hover:bg-accent ${department === 'programming' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => setDepartment('programming')}>
            <Code2 className="w-7 h-7 mb-3" />
            <p className="font-semibold">{t('customReceipts.programming', { defaultValue: 'Programming' })}</p>
          </button>
          <button className={`rounded-lg border p-6 text-left hover:bg-accent ${department === 'both' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => setDepartment('both')}>
            <Check className="w-7 h-7 mb-3" />
            <p className="font-semibold">{t('customReceipts.both', { defaultValue: 'Both' })}</p>
          </button>
          <div className="md:col-span-3">
            <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground" onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={walkInCustomer}
              onChange={e => {
                setWalkInCustomer(e.target.checked)
                if (e.target.checked) {
                  setSelectedCustomer(null)
                  clearLoyaltyOnWalkIn()
                }
              }}
            />
            {t('customReceipts.walkInCustomer', { defaultValue: 'Walk-in Customer' })}
          </label>
          {!walkInCustomer && (
            <>
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Search customer by name or phone" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 max-h-56 overflow-auto">
                  {customerResults.map(c => (
                    <button key={c.id} className={`w-full text-left px-3 py-2 rounded border ${selectedCustomer?.id === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`} onClick={() => { setSelectedCustomer(c); void onLoadVehicles(c.id); void loadCustomerLoyalty(c.id, deptParamForLoyalty(department)) }}>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone || '—'}</p>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Vehicles</p>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {customerVehicles.map(v => (
                      <button key={v.id} className={`w-full text-left px-3 py-2 rounded border ${selectedVehicle?.id === v.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`} onClick={() => setSelectedVehicle(v)}>
                        <p>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</p>
                        <p className="text-xs text-muted-foreground">{v.license_plate || '—'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-medium">New customer</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Full name" />
                  <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="Phone" />
                </div>
                <button className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent" onClick={() => void onCreateCustomer()}>+ Add customer</button>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-md border border-border" onClick={() => setStep(1)}>Back</button>
            {selectedVehicle && !walkInCustomer ? (
              <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground" onClick={() => setStep(5)}>Next</button>
            ) : (
              <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground" onClick={() => setStep(3)}>Next</button>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={brandSearch} onChange={e => setBrandSearch(e.target.value)} placeholder="Search brand" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {filteredBrands.map(b => (
              <button key={b.id} onClick={() => setSelectedBrand(b)} className={`rounded-lg border p-3 text-center hover:bg-accent ${selectedBrand?.id === b.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                {b.logo ? <img src={b.logo} alt={b.name} className="h-10 mx-auto object-contain mb-2" /> : <div className="h-10 mb-2 grid place-items-center text-xs text-muted-foreground">No logo</div>}
                <p className="text-sm font-medium">{b.name}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-md border border-border" onClick={() => setStep(2)}>Back</button>
            <button disabled={!selectedBrand} className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60" onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
              <option value="">Select model</option>
              {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="+ Add new model" />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-md border border-border" onClick={() => setStep(3)}>Back</button>
            <button disabled={!selectedModel && !newModel.trim()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60" onClick={() => setStep(5)}>Next</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{department}</p>
                <h2 className="text-lg font-semibold">{selectedBrand?.name || selectedVehicle?.make || 'Walk-in'} · {chosenModel || selectedVehicle?.model || 'Walk-in'}</h2>
              </div>
              {selectedBrand?.logo && <img src={selectedBrand.logo} className="h-10 object-contain" />}
            </div>

            <CarInspectionPanel
              showInspection={showInspection}
              setShowInspection={setShowInspection}
              inspectionMarkers={inspectionMarkers}
              setInspectionMarkers={setInspectionMarkers}
              inspectionNotes={inspectionNotes}
              setInspectionNotes={setInspectionNotes}
              selectedMarkerType={selectedMarkerType}
              setSelectedMarkerType={setSelectedMarkerType}
              t={t}
            />

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold">Catalog services</h3>
              {catalogServices.map(s => (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-1 grid place-items-center"><input type="checkbox" checked={s.checked} onChange={e => setCatalogServices(prev => prev.map(x => x.id === s.id ? { ...x, checked: e.target.checked } : x))} /></label>
                  <div className="col-span-7 text-sm">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.department}</div>
                  </div>
                  <input className="col-span-4 rounded-md border border-border bg-background px-3 py-2 text-sm" type="number" min="0" step="0.01" value={s.sell} onChange={e => setCatalogServices(prev => prev.map(x => x.id === s.id ? { ...x, sell: e.target.value } : x))} />
                </div>
              ))}
            </div>

            <SmartCustomServiceSection
              lines={customServices}
              onAdd={() => setCustomServices(prev => [...prev, newSmartCustomLine(department === 'programming' ? 'programming' : 'mechanical')])}
              onRemove={id => setCustomServices(prev => prev.filter(s => s.id !== id))}
              onUpdate={(id, field, value) => setCustomServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-4 h-fit sticky top-4 space-y-4">
            <h3 className="font-semibold">Summary</h3>
            <div className="space-y-1 text-sm">
              {selectedLines.map((s, i) => (
                <div key={`${s.service_name}-${i}`} className="flex items-center justify-between">
                  <span className="truncate">{s.service_name}</span>
                  <CurrencyText amount={s.sell_price} />
                </div>
              ))}
            </div>
            {filteredSmartEmployees.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground">Assigned Employee</p>
                <select
                  value={primaryEmployeeId ?? ''}
                  onChange={e => setPrimaryEmployeeId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                >
                  <option value="">— Primary technician</option>
                  {filteredSmartEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_id})
                    </option>
                  ))}
                </select>
                <select
                  value={assistantEmployeeId ?? ''}
                  onChange={e => setAssistantEmployeeId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                >
                  <option value="">— Assistant (optional)</option>
                  {filteredSmartEmployees
                    .filter(e => e.id !== primaryEmployeeId)
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.employee_id})
                      </option>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">Start</label>
                    <input
                      type="time"
                      value={workStartTime}
                      onChange={e => setWorkStartTime(e.target.value)}
                      className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">End</label>
                    <input
                      type="time"
                      value={workEndTime}
                      onChange={e => setWorkEndTime(e.target.value)}
                      className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                    />
                  </div>
                </div>
                {hoursWorked ? (
                  <p className="text-xs text-primary font-medium">⏱ {hoursWorked} hours worked</p>
                ) : null}
              </div>
            )}
            {loyaltyWidget}
            <div>
              <label className={smartLabelCls}>{t('customReceipts.paymentMethod', { defaultValue: 'Payment Method' })}</label>
              <select className={smartInputCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'Cash' | 'Card' | 'Bank Transfer')}>
                <option value="Cash">{t('customReceipts.cash', { defaultValue: 'Cash' })}</option>
                <option value="Card">{t('customReceipts.card', { defaultValue: 'Card' })}</option>
                <option value="Bank Transfer">{t('customReceipts.transfer', { defaultValue: 'Bank Transfer' })}</option>
              </select>
            </div>
            <div>
              <label className={smartLabelCls}>Discount</label>
              <div className="flex gap-2">
                <select
                  className={`${smartInputCls} flex-1 min-w-0`}
                  value={smartDiscountType}
                  onChange={e => {
                    const v = e.target.value as '' | 'percent' | 'fixed'
                    setSmartDiscountType(v)
                    setSmartDiscountValue('')
                  }}
                >
                  <option value="">No Discount</option>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (AED)</option>
                </select>
                {smartDiscountType !== '' && (
                  <input
                    type="number"
                    min="0"
                    className={`${smartInputCls} flex-1 min-w-0`}
                    placeholder={smartDiscountType === 'percent' ? 'e.g. 10' : 'e.g. 20'}
                    value={smartDiscountValue}
                    onChange={e => setSmartDiscountValue(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t('customReceipts.subtotal', { defaultValue: 'Subtotal' })}</span>
              <CurrencyText amount={subtotal} />
            </div>
            {smartDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Discount</span>
                <span className="text-red-600">- AED {smartDiscountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <CurrencyText amount={smartFinalTotal} />
            </div>
            <button className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground" onClick={() => void onSave(true)}>Save & Print</button>
            <button className="w-full px-4 py-2 rounded-md border border-border" onClick={() => void onSave(false)}>Save Only</button>
          </div>
        </div>
      )}
    </div>
  )
}

function newLine(): ServiceLine {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, service_name: '', cost: '', sell_price: '' }
}

function newSmartCustomLine(department: 'mechanical' | 'programming'): SmartCustomServiceLine {
  return { ...newLine(), department }
}

function numberOrZero(value: string): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function cleanLines(lines: ServiceLine[]): Array<{ service_name: string; cost: number; sell_price: number }> {
  return lines
    .map(line => ({
      service_name: line.service_name.trim(),
      cost: Math.max(0, numberOrZero(line.cost)),
      sell_price: Math.max(0, numberOrZero(line.sell_price)),
    }))
    .filter(line => line.service_name !== '' && line.sell_price >= 0)
}

function cleanSmartCustomLines(lines: SmartCustomServiceLine[]): Array<{ service_name: string; cost: number; sell_price: number; department: 'mechanical' | 'programming' }> {
  return lines
    .map(line => ({
      service_name: line.service_name.trim(),
      cost: Math.max(0, numberOrZero(line.cost)),
      sell_price: Math.max(0, numberOrZero(line.sell_price)),
      department: line.department === 'programming' ? 'programming' as const : 'mechanical' as const,
    }))
    .filter(line => line.service_name !== '' && line.sell_price >= 0)
}

function parseLines(receipt: Receipt): Array<{ service_name: string; cost: number; sell_price: number }> {
  const mechanical = parseLineArray(receipt.mechanical_services_json)
  const programming = parseLineArray(receipt.programming_services_json)
  return [...mechanical, ...programming]
}

function parseLineArray(raw: string | null): Array<{ service_name: string; cost: number; sell_price: number }> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<{ service_name: string; cost: number; sell_price: number }>
    return parsed.filter(line => line?.service_name)
  } catch {
    return []
  }
}

function prettyDepartment(dep: Department): string {
  if (dep === 'mechanical') return 'Mechanical'
  if (dep === 'programming') return 'Programming'
  return 'Both'
}

