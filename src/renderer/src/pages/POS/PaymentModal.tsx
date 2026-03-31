import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { CartPayment } from '../../store/cartStore'
import { formatCurrency } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'

interface Props {
  total: number
  onConfirm: (payments: CartPayment[]) => void
  onClose: () => void
}

const METHODS: Array<{ value: CartPayment['method']; label: string }> = [
  { value: 'cash',     label: 'Cash' },
  { value: 'card',     label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'mobile',   label: 'Mobile Pay' },
  { value: 'other',    label: 'Other' },
]

function cashReceivedForRow(p: CartPayment): number {
  if (p.method !== 'cash') return p.amount
  const r = p.cash_received
  if (r != null && r > 0) return r
  return p.amount
}

export default function PaymentModal({ total, onConfirm, onClose }: Props): JSX.Element {
  const { t } = useTranslation()
  const [payments, setPayments] = useState<CartPayment[]>([
    { method: 'cash', amount: total, cash_received: total },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPayments(prev => {
      if (prev.length !== 1 || prev[0].method !== 'cash') return prev
      const row = prev[0]
      const prevRecv = cashReceivedForRow(row)
      const recv = Math.max(prevRecv, total)
      return [{ ...row, amount: total, cash_received: recv }]
    })
  }, [total])

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const totalCashChange = payments.reduce((s, p) => {
    if (p.method !== 'cash') return s
    const recv = cashReceivedForRow(p)
    const amt = Number(p.amount) || 0
    return s + Math.max(0, recv - amt)
  }, 0)
  const remaining = Math.max(0, total - totalPaid)

  const cashRowInvalid = payments.some(p => {
    if (p.method !== 'cash') return false
    return cashReceivedForRow(p) + 1e-9 < (Number(p.amount) || 0)
  })

  const addMethod = () => setPayments(p => [...p, { method: 'cash', amount: 0, cash_received: 0 }])

  const remove = (i: number) => setPayments(p => p.filter((_, idx) => idx !== i))

  const updateMethod = (i: number, method: CartPayment['method']) => {
    setPayments(p => p.map((row, idx) => {
      if (idx !== i) return row
      const amt = Number(row.amount) || 0
      if (method === 'cash') {
        const recv = row.method === 'cash' ? cashReceivedForRow(row) : amt
        return { ...row, method, cash_received: recv > 0 ? recv : amt }
      }
      const { cash_received: _c, ...rest } = row
      return { ...rest, method }
    }))
  }

  const updateAmount = (i: number, val: string) => {
    const num = Number(val) || 0
    setPayments(p => p.map((row, idx) => {
      if (idx !== i) return row
      if (row.method === 'cash') {
        const prevRecv = cashReceivedForRow(row)
        const recv = prevRecv < num ? num : prevRecv
        return { ...row, amount: num, cash_received: recv }
      }
      return { ...row, amount: num }
    }))
  }

  const updateCashReceived = (i: number, val: string) => {
    const num = Number(val) || 0
    setPayments(p => p.map((row, idx) => {
      if (idx !== i || row.method !== 'cash') return row
      const amt = Number(row.amount) || 0
      const recv = num < amt ? amt : num
      return { ...row, cash_received: recv }
    }))
  }

  const handleConfirm = async () => {
    if (cashRowInvalid) return
    if (totalPaid < total && !window.confirm(t('pos.partialPaymentConfirm'))) return
    setSaving(true)
    const payload: CartPayment[] = payments.map(p => {
      if (p.method !== 'cash') return p
      const recv = cashReceivedForRow(p)
      const amt = Number(p.amount) || 0
      if (recv > amt + 1e-9) return { ...p, cash_received: recv }
      const { cash_received: _c, ...rest } = p
      return rest as CartPayment
    })
    onConfirm(payload)
  }

  return (
    <Modal open title={t('pos.payment')} onClose={onClose} size="md"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleConfirm} disabled={saving || totalPaid <= 0 || cashRowInvalid}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('pos.confirmPayment')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{t('common.total')}</span>
          <span className="text-xl font-bold text-foreground"><CurrencyText amount={total} /></span>
        </div>

        <div className="space-y-3">
          {payments.map((p, i) => {
            const amt = Number(p.amount) || 0
            const recv = cashReceivedForRow(p)
            const rowChange = p.method === 'cash' ? Math.max(0, recv - amt) : 0
            const rowInvalid = p.method === 'cash' && recv + 1e-9 < amt

            return (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-card/50">
                <div className="flex items-center gap-2">
                  <select value={p.method} onChange={e => updateMethod(i, e.target.value as CartPayment['method'])}
                    className="px-2 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring shrink-0">
                    {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  {payments.length > 1 && (
                    <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className={`grid gap-2 ${p.method === 'cash' ? 'sm:grid-cols-2' : ''}`}>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">
                      {p.method === 'cash'
                        ? t('pos.amountApplied', { defaultValue: 'Amount applied to sale' })
                        : t('pos.amount', { defaultValue: 'Amount' })}
                    </label>
                    <input type="number" min="0" step="0.01" value={p.amount || ''}
                      onChange={e => updateAmount(i, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="0.00"
                    />
                  </div>
                  {p.method === 'cash' && (
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">
                        {t('pos.amountReceived', { defaultValue: 'Cash received' })}
                      </label>
                      <input type="number" min="0" step="0.01" value={recv || ''}
                        onChange={e => updateCashReceived(i, e.target.value)}
                        className={`w-full px-2 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                          rowInvalid ? 'border-destructive' : 'border-input'
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>
                {p.method === 'cash' && rowChange > 0 && (
                  <div className="flex justify-between items-center text-sm rounded-md bg-emerald-500/10 dark:bg-emerald-950/40 px-2 py-1.5 border border-emerald-500/20">
                    <span className="text-muted-foreground">{t('pos.change', { defaultValue: 'Change due' })}</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums"><CurrencyText amount={rowChange} /></span>
                  </div>
                )}
                {p.method === 'cash' && rowInvalid && (
                  <p className="text-xs text-destructive">{t('pos.cashReceivedTooLow', { defaultValue: 'Cash received must be at least the amount applied.' })}</p>
                )}
              </div>
            )
          })}
        </div>

        <button type="button" onClick={addMethod} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" />{t('pos.addPaymentMethod')}
        </button>

        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('pos.amountPaid')}</span>
            <span className="font-medium"><CurrencyText amount={totalPaid} /></span>
          </div>
          {totalCashChange > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('pos.changeTotal', { defaultValue: 'Total change (cash)' })}</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400"><CurrencyText amount={totalCashChange} /></span>
            </div>
          )}
          {remaining > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('pos.balanceDue')}</span>
              <span className="font-bold text-destructive"><CurrencyText amount={remaining} className="text-destructive" /></span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
