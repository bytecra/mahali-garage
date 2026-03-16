import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { CartPayment } from '../../store/cartStore'
import { formatCurrency } from '../../lib/utils'

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

export default function PaymentModal({ total, onConfirm, onClose }: Props): JSX.Element {
  const { t } = useTranslation()
  const [payments, setPayments] = useState<CartPayment[]>([{ method: 'cash', amount: total }])
  const [saving, setSaving] = useState(false)

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const change = Math.max(0, totalPaid - total)
  const remaining = Math.max(0, total - totalPaid)

  const addMethod = () => setPayments(p => [...p, { method: 'cash', amount: 0 }])
  const remove = (i: number) => setPayments(p => p.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof CartPayment, val: string) =>
    setPayments(p => p.map((row, idx) => idx === i ? { ...row, [field]: field === 'amount' ? Number(val) : val } : row))

  const handleConfirm = async () => {
    if (totalPaid < total && !window.confirm(t('pos.partialPaymentConfirm'))) return
    setSaving(true)
    onConfirm(payments)
  }

  return (
    <Modal open title={t('pos.payment')} onClose={onClose} size="md"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleConfirm} disabled={saving || totalPaid <= 0}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('pos.confirmPayment')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Total */}
        <div className="bg-muted/50 rounded-lg px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{t('common.total')}</span>
          <span className="text-xl font-bold text-foreground">{formatCurrency(total)}</span>
        </div>

        {/* Payment rows */}
        <div className="space-y-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={p.method} onChange={e => update(i, 'method', e.target.value)}
                className="px-2 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={p.amount || ''}
                onChange={e => update(i, 'amount', e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0.00"
              />
              {payments.length > 1 && (
                <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addMethod} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" />{t('pos.addPaymentMethod')}
        </button>

        {/* Summary */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('pos.amountPaid')}</span>
            <span className="font-medium">{formatCurrency(totalPaid)}</span>
          </div>
          {change > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('pos.change')}</span>
              <span className="font-bold text-green-600">{formatCurrency(change)}</span>
            </div>
          )}
          {remaining > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('pos.balanceDue')}</span>
              <span className="font-bold text-destructive">{formatCurrency(remaining)}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
