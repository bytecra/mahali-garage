import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'

interface Product { id: number; name: string; stock_quantity: number; unit: string }

type AdjType = 'in' | 'out' | 'correction' | 'damage' | 'return'

interface Props { product: Product; onClose: () => void; onSaved: () => void }

export default function StockAdjustmentModal({ product, onClose, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const [type, setType]       = useState<AdjType>('in')
  const [qty, setQty]         = useState('1')
  const [reason, setReason]   = useState('')
  const [saving, setSaving]   = useState(false)

  const preview = (): number => {
    const q = Number(qty) || 0
    if (type === 'correction') return q
    if (type === 'in' || type === 'return') return product.stock_quantity + q
    return Math.max(0, product.stock_quantity - q)
  }

  const handleSave = async () => {
    const q = Number(qty)
    if (!q || q <= 0) { toast.error('Enter a valid quantity'); return }
    setSaving(true)
    const res = await window.electronAPI.products.adjustStock(product.id, { type, quantity: q, reason: reason || undefined })
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    onSaved()
  }

  const types: { value: AdjType; label: string; color: string }[] = [
    { value: 'in',        label: t('inventory.stockIn'),   color: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' },
    { value: 'out',       label: t('inventory.stockOut'),  color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
    { value: 'correction',label: t('inventory.correction'),color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
    { value: 'damage',    label: t('inventory.damage'),    color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' },
    { value: 'return',    label: t('inventory.return'),    color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' },
  ]

  return (
    <Modal
      open
      title={t('inventory.adjustStock')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="font-medium text-foreground">{product.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Current stock: <strong className="text-foreground">{product.stock_quantity} {product.unit}</strong>
          </p>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium mb-2">{t('common.actions')}</label>
          <div className="flex flex-wrap gap-2">
            {types.map(({ value, label, color }) => (
              <button
                key={value}
                onClick={() => setType(value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all border-2 ${
                  type === value ? `${color} border-current` : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            {type === 'correction' ? 'New Stock Level' : t('common.quantity')}
          </label>
          <input
            type="number"
            min="0"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>

        {/* Preview */}
        <div className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3">
          <span className="text-sm text-muted-foreground">After adjustment:</span>
          <span className="font-bold text-lg text-foreground">{preview()} {product.unit}</span>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('inventory.reason')}</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </Modal>
  )
}
