import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Printer } from 'lucide-react'
import { useBrandingStore } from '../../store/brandingStore'
import { getCurrencySymbol, getCurrencyCode } from '../../store/currencyStore'

interface CustomReceiptForm {
  customerName: string
  plateNumber: string
  carType: string
  servicesDescription: string
  amount: string
  amountReceived: string
  paymentMethod: string
  notes: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const INITIAL: CustomReceiptForm = {
  customerName: 'Walk-in Customer',
  plateNumber: '',
  carType: '',
  servicesDescription: '',
  amount: '',
  amountReceived: '',
  paymentMethod: 'Cash',
  notes: '',
}

export default function CustomReceiptModal({ open, onClose, onCreated }: Props): JSX.Element | null {
  const { t } = useTranslation()
  const { appName } = useBrandingStore()
  const [form, setForm] = useState<CustomReceiptForm>({ ...INITIAL })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  function set<K extends keyof CustomReceiptForm>(key: K, value: CustomReceiptForm[K]): void {
    setForm(prev => ({ ...prev, [key]: value }))
    if (error) setError('')
  }

  async function handleSubmit(andPrint: boolean): Promise<void> {
    const amt = parseFloat(form.amount)
    if (!form.plateNumber.trim()) { setError(t('customReceipts.errorPlate')); return }
    if (!form.carType.trim()) { setError(t('customReceipts.errorCarType')); return }
    if (isNaN(amt) || amt <= 0) { setError(t('customReceipts.errorAmount')); return }

    const isCash = form.paymentMethod.toLowerCase() === 'cash'
    let cashReceived: number | undefined
    if (isCash) {
      const raw = form.amountReceived.trim()
      const ar = raw === '' ? amt : parseFloat(raw)
      if (isNaN(ar) || ar + 1e-9 < amt) {
        setError(t('customReceipts.errorCashReceived', { defaultValue: 'Cash received must be at least the receipt total.' }))
        return
      }
      cashReceived = ar
    }

    setSaving(true)
    try {
      const res = await window.electronAPI.customReceipts.create({
        customer_name: form.customerName.trim() || 'Walk-in Customer',
        plate_number: form.plateNumber.trim(),
        car_type: form.carType.trim(),
        services_description: form.servicesDescription.trim(),
        amount: amt,
        ...(isCash && cashReceived != null ? { cash_received: cashReceived } : {}),
        payment_method: form.paymentMethod,
        notes: form.notes.trim(),
      }) as { success: boolean; data?: { id: number; receipt_number: string }; error?: string }

      if (!res.success) { setError(res.error || 'Failed'); return }

      if (andPrint && res.data) {
        const full = await window.electronAPI.customReceipts.getById(res.data.id) as {
          success: boolean; data?: Record<string, unknown>
        }
        if (full.success && full.data) printReceipt(full.data)
      }

      setForm({ ...INITIAL })
      onCreated?.()
      onClose()
    } catch {
      setError('Failed to create receipt')
    } finally {
      setSaving(false)
    }
  }

  function printReceipt(receipt: Record<string, unknown>): void {
    const date = new Date(receipt.created_at as string).toLocaleString()
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
<div class="line"></div>
<div class="row"><span>Customer:</span><span>${receipt.customer_name}</span></div>
<div class="row"><span>Plate:</span><span class="bold">${receipt.plate_number}</span></div>
<div class="row"><span>Vehicle:</span><span>${receipt.car_type}</span></div>
<div class="line"></div>
<div class="bold">Services:</div>
<div class="services">${receipt.services_description || '—'}</div>
<div class="line"></div>
<div class="row"><span class="total">Total:</span><span class="total">${getCurrencySymbol() + Number(receipt.amount).toFixed(2)} (${getCurrencyCode()})</span></div>
${(() => {
  const sym = getCurrencySymbol()
  const tot = Number(receipt.amount)
  const pm = String(receipt.payment_method || '').toLowerCase()
  const cr = receipt.cash_received != null ? Number(receipt.cash_received) : null
  if (pm !== 'cash' || cr == null || !(cr > 0)) {
    return `<div class="row"><span>Payment:</span><span>${receipt.payment_method}</span></div>`
  }
  const ch = Math.max(0, Math.round((cr - tot) * 100) / 100)
  return `<div class="row"><span>Payment:</span><span>${receipt.payment_method}</span></div>
<div class="row"><span>Cash received:</span><span class="bold">${sym + cr.toFixed(2)}</span></div>
${ch > 0 ? `<div class="row"><span>Change:</span><span class="bold">${sym + ch.toFixed(2)}</span></div>` : ''}`
})()}
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

  const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('customReceipts.newReceipt')}</h2>
            <p className="text-sm text-muted-foreground">{t('customReceipts.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.customerName')}</label>
            <input className={inputCls} value={form.customerName} onChange={e => set('customerName', e.target.value)}
              placeholder="Walk-in Customer" />
          </div>

          {/* Plate + Car Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.plateNumber')} *</label>
              <input className={inputCls} value={form.plateNumber} onChange={e => set('plateNumber', e.target.value)}
                placeholder="ABC-123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.carType')} *</label>
              <input className={inputCls} value={form.carType} onChange={e => set('carType', e.target.value)}
                placeholder="Toyota Camry 2020" />
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.servicesDescription')}</label>
            <textarea className={inputCls + ' resize-none'} rows={3} value={form.servicesDescription}
              onChange={e => set('servicesDescription', e.target.value)}
              placeholder={t('customReceipts.servicesPlaceholder')} />
          </div>

          {/* Amount + Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.amount')} *</label>
              <input className={inputCls} type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.paymentMethod')}</label>
              <select className={inputCls} value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                <option value="Cash">{t('customReceipts.cash')}</option>
                <option value="Card">{t('customReceipts.card')}</option>
                <option value="Transfer">{t('customReceipts.transfer')}</option>
              </select>
            </div>
          </div>

          {form.paymentMethod.toLowerCase() === 'cash' && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('customReceipts.cashReceived', { defaultValue: 'Cash received' })} *
                </label>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amountReceived}
                  onChange={e => set('amountReceived', e.target.value)}
                  placeholder={form.amount ? String(Math.max(parseFloat(form.amount) || 0, 0)) : '0.00'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('customReceipts.cashReceivedHint', { defaultValue: 'Leave blank to match total (exact cash). Change is recorded automatically.' })}
                </p>
              </div>
              {(() => {
                const tot = parseFloat(form.amount)
                const raw = form.amountReceived.trim()
                const recv = raw === '' ? tot : parseFloat(raw)
                if (isNaN(tot) || tot <= 0 || isNaN(recv) || recv < tot) return null
                const ch = Math.round((recv - tot) * 100) / 100
                if (ch <= 0) return null
                return (
                  <div className="flex justify-between items-center text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-2 py-1.5">
                    <span>{t('pos.change', { defaultValue: 'Change due' })}</span>
                    <span>{getCurrencySymbol() + ch.toFixed(2)} ({getCurrencyCode()})</span>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('customReceipts.notes')}</label>
            <textarea className={inputCls + ' resize-none'} rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder={t('customReceipts.notesPlaceholder')} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent">
            {t('common.cancel')}
          </button>
          <button onClick={() => handleSubmit(false)} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {t('common.save')}
          </button>
          <button onClick={() => handleSubmit(true)} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
            <Printer className="w-4 h-4" />
            {t('customReceipts.createAndPrint')}
          </button>
        </div>
      </div>
    </div>
  )
}
