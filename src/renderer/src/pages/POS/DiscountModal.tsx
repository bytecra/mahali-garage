import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/shared/Modal'
import { formatCurrency } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { getCurrencySymbol } from '../../store/currencyStore'
import { useCartStore } from '../../store/cartStore'

interface Props { onClose: () => void }

export default function DiscountModal({ onClose }: Props): JSX.Element {
  const { t } = useTranslation()
  const { discountType, discountValue, setDiscount, subtotal } = useCartStore()
  const [type, setType] = useState<'percent' | 'fixed'>(discountType ?? 'percent')
  const [value, setValue] = useState(String(discountValue || ''))

  const preview = (): number => {
    const v = Number(value) || 0
    if (type === 'percent') return (subtotal() * v) / 100
    return Math.min(v, subtotal())
  }

  const handleApply = () => {
    const v = Number(value) || 0
    setDiscount(v > 0 ? type : null, v)
    onClose()
  }

  const handleClear = () => { setDiscount(null, 0); onClose() }

  return (
    <Modal open title={t('pos.applyDiscount')} onClose={onClose} size="sm"
      footer={
        <>
          <button onClick={handleClear} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('pos.clearDiscount')}</button>
          <button onClick={handleApply} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">{t('common.apply')}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['percent', 'fixed'] as const).map(t_ => (
            <button key={t_} onClick={() => setType(t_)}
              className={`flex-1 py-2 text-sm rounded-md border-2 font-medium transition-colors ${type === t_ ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}>
              {t_ === 'percent' ? '%' : getCurrencySymbol()} {t_ === 'percent' ? t('common.percent') : t('common.fixed')}
            </button>
          ))}
        </div>
        <input
          type="number" min="0" max={type === 'percent' ? 100 : undefined}
          value={value} onChange={e => setValue(e.target.value)} autoFocus
          className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={type === 'percent' ? '0–100' : '0.00'}
        />
        {Number(value) > 0 && (
          <div className="flex justify-between text-sm bg-muted/30 rounded-md px-3 py-2">
            <span className="text-muted-foreground">{t('pos.discountAmount')}</span>
            <span className="font-bold text-destructive"><CurrencyText amount={-preview()} className="text-destructive" /></span>
          </div>
        )}
      </div>
    </Modal>
  )
}
