import { useState, useEffect, useCallback, useMemo } from 'react'
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
}

interface CustomerLite { id: number; name: string; phone: string | null }
interface VehicleLite { id: number; make: string; model: string; year: number | null; license_plate: string | null }
interface BrandLite { id: number; name: string; logo: string | null }
interface CatalogService { id: number; service_name: string; model: string; price: number; department: 'mechanical' | 'programming' }
type WizardStep = 1 | 2 | 3 | 4 | 5

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

  const canCreate = ['owner', 'manager'].includes(role ?? '')
  const canDelete = ['owner', 'manager'].includes(role ?? '')

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
    if (mode !== 'smart' || smartStep !== 2) return
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
  }

  async function handlePrint(receipt: Receipt): Promise<void> {
    try {
      await printCustomReceiptA4(receipt)
    } catch (e) {
      console.error('Receipt print failed', e)
      toast.error(t('common.error'))
    }
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
        if (full.success && full.data) await handlePrint(full.data)
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

  return (
    <div>
      {mode === 'list' && (
        <>
          <div className="flex items-center justify-between gap-3 mb-6">
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
                  onChange={e => setWalkInCustomer(e.target.checked)}
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
            }
            const res = await window.electronAPI.customReceipts.create(payload) as { success: boolean; data?: { id: number }; error?: string }
            if (!res.success || !res.data) {
              toast.error(res.error || t('common.error'))
              return
            }
            if (andPrint) {
              const full = await window.electronAPI.customReceipts.getById(res.data.id) as { success: boolean; data?: Receipt }
              if (full.success && full.data) await handlePrint(full.data)
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
            <input type="checkbox" checked={walkInCustomer} onChange={e => setWalkInCustomer(e.target.checked)} />
            {t('customReceipts.walkInCustomer', { defaultValue: 'Walk-in Customer' })}
          </label>
          {!walkInCustomer && (
            <>
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Search customer by name or phone" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 max-h-56 overflow-auto">
                  {customerResults.map(c => (
                    <button key={c.id} className={`w-full text-left px-3 py-2 rounded border ${selectedCustomer?.id === c.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`} onClick={() => { setSelectedCustomer(c); void onLoadVehicles(c.id) }}>
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

