import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Eye, Plus, Printer, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import Modal from '../../components/shared/Modal'
import { formatCurrency, formatDate } from '../../lib/utils'
import { getCurrencySymbol, getCurrencyCode } from '../../store/currencyStore'
import { useAuthStore } from '../../store/authStore'
import { useBrandingStore } from '../../store/brandingStore'
import { toast } from '../../store/notificationStore'

type Department = 'mechanical' | 'programming' | 'both'

interface ServiceLine {
  id: string
  service_name: string
  cost: string
  sell_price: string
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
}

export default function CustomReceiptsPage(): JSX.Element {
  const { t } = useTranslation()
  const { appName } = useBrandingStore()
  const user = useAuthStore(s => s.user)
  const role = user?.role
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [viewReceipt, setViewReceipt] = useState<Receipt | null>(null)

  const [department, setDepartment] = useState<Department>('both')
  const [walkInCustomer, setWalkInCustomer] = useState(false)
  const [walkInCar, setWalkInCar] = useState(false)
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

  const subtotal = useMemo(() => {
    const sum = [...mechanical, ...programming].reduce((acc, line) => acc + numberOrZero(line.sell_price), 0)
    return Math.round(sum * 100) / 100
  }, [mechanical, programming])

  function resetForm(): void {
    setDepartment('both')
    setWalkInCustomer(false)
    setWalkInCar(false)
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
  }

  function handlePrint(receipt: Receipt): void {
    const date = new Date(receipt.created_at).toLocaleString()
    const lines = parseLines(receipt)
    const lineRows = lines.map(line => `
      <div class="row"><span>${escapeHtml(line.service_name)}</span><span>${getCurrencySymbol() + Number(line.sell_price).toFixed(2)}</span></div>
    `).join('')
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 12px; margin: 2px 0 8px; font-weight: normal; }
  .services { white-space: pre-wrap; margin: 4px 0; }
  .total { font-size: 16px; font-weight: bold; }
  .footer { margin-top: 12px; font-size: 11px; }
</style></head><body>
<div class="center"><h1>${appName}</h1><h2>Auto Repair &amp; Service</h2></div>
<div class="line"></div>
<div class="row"><span>Receipt:</span><span class="bold">${receipt.receipt_number}</span></div>
<div class="row"><span>Date:</span><span>${date}</span></div>
<div class="row"><span>Department:</span><span>${prettyDepartment(receipt.department)}</span></div>
<div class="line"></div>
<div class="row"><span>Customer:</span><span>${receipt.customer_name || '—'}</span></div>
<div class="row"><span>Plate:</span><span class="bold">${receipt.plate_number || '—'}</span></div>
<div class="row"><span>Vehicle:</span><span>${[receipt.car_company, receipt.car_model, receipt.car_year].filter(Boolean).join(' ') || receipt.car_type || '—'}</span></div>
<div class="line"></div>
<div class="bold">Services:</div>
${lineRows || '<div class="services">—</div>'}
<div class="line"></div>
<div class="row"><span class="total">Total:</span><span class="total">${getCurrencySymbol() + Number(receipt.amount).toFixed(2)} (${getCurrencyCode()})</span></div>
<div class="row"><span>Payment:</span><span>${receipt.payment_method || 'Cash'}</span></div>
${receipt.notes ? `<div class="line"></div><div>Notes: ${receipt.notes}</div>` : ''}
<div class="line"></div>
<div class="center footer">
  <p>Thank you for your business!</p>
  <p>Served by: ${receipt.created_by_name || 'Staff'}</p>
</div>
</body></html>`

    const win = window.open('', '_blank', 'width=350,height=600')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.print(); win.close() }, 400)
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
    if (effectiveMechanical.length + effectiveProgramming.length === 0) {
      toast.error(t('customReceipts.errorServiceRequired', { defaultValue: 'Add at least one service line' }))
      return
    }
    setSaving(true)
    try {
      const payload = {
        department,
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
        amount: subtotal,
        payment_method: 'Cash',
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
        if (full.success && full.data) handlePrint(full.data)
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
                onClick={() => setMode('form')}
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
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.amount)}</td>
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
                                onClick={() => handlePrint(r)}
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

      {mode === 'form' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setMode('list')} className="p-2 rounded-md border border-border hover:bg-accent" title={t('common.back', { defaultValue: 'Back' })}>
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
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{t('customReceipts.subtotal', { defaultValue: 'Subtotal' })}</span>
                  <span>{formatCurrency(subtotal)}</span>
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

      <ConfirmDialog
        open={deleteId != null}
        title={t('common.delete')}
        message={t('assets.deleteMessage', { defaultValue: 'This cannot be undone.' })}
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
                    <span>{formatCurrency(line.sell_price)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('customReceipts.subtotal', { defaultValue: 'Subtotal' })}</span>
              <span>{formatCurrency(viewReceipt.amount)}</span>
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

function newLine(): ServiceLine {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, service_name: '', cost: '', sell_price: '' }
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

function escapeHtml(v: string): string {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
