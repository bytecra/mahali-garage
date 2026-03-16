import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'

// Defined outside component so React never sees them as new types on re-render
const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label className="block text-sm font-medium mb-1.5">{children}{required && ' *'}</label>
}

function FieldInput({ value, onChange, type = 'text' }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
}

function FieldSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { id: number; name: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">—</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

interface ProductFormData {
  name: string; sku: string; barcode: string; description: string
  category_id: string; brand_id: string; supplier_id: string
  cost_price: string; sell_price: string; stock_quantity: string
  low_stock_threshold: string; unit: string; is_active: boolean
}

const EMPTY: ProductFormData = {
  name: '', sku: '', barcode: '', description: '',
  category_id: '', brand_id: '', supplier_id: '',
  cost_price: '0', sell_price: '0', stock_quantity: '0',
  low_stock_threshold: '5', unit: 'pcs', is_active: true,
}

const UNITS = ['pcs', 'box', 'kg', 'g', 'L', 'mL', 'set', 'pair']

interface Props {
  open: boolean
  productId: number | null
  onClose: () => void
  onSaved: () => void
}

export default function ProductForm({ open, productId, onClose, onSaved }: Props): JSX.Element | null {
  const { t } = useTranslation()
  const [form, setForm]           = useState<ProductFormData>(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [errors, setErrors]       = useState<Partial<ProductFormData>>({})
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [brands, setBrands]       = useState<{ id: number; name: string }[]>([])
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    if (!open) return
    // Load reference data
    Promise.all([
      window.electronAPI.categories.list(),
      window.electronAPI.brands.list(),
      window.electronAPI.suppliers.list({ pageSize: 200 }),
    ]).then(([cats, brands, supps]) => {
      if (cats.success)   setCategories(cats.data as { id: number; name: string }[])
      if (brands.success) setBrands(brands.data as { id: number; name: string }[])
      if (supps.success)  setSuppliers((supps.data as { items: { id: number; name: string }[] }).items)
    })

    if (productId) {
      setLoading(true)
      window.electronAPI.products.getById(productId).then(res => {
        setLoading(false)
        if (!res.success || !res.data) return
        const p = res.data as Record<string, unknown>
        setForm({
          name: String(p.name ?? ''),
          sku: String(p.sku ?? ''),
          barcode: String(p.barcode ?? ''),
          description: String(p.description ?? ''),
          category_id: p.category_id ? String(p.category_id) : '',
          brand_id:    p.brand_id    ? String(p.brand_id)    : '',
          supplier_id: p.supplier_id ? String(p.supplier_id) : '',
          cost_price:  String(p.cost_price ?? '0'),
          sell_price:  String(p.sell_price ?? '0'),
          stock_quantity: String(p.stock_quantity ?? '0'),
          low_stock_threshold: String(p.low_stock_threshold ?? '5'),
          unit: String(p.unit ?? 'pcs'),
          is_active: Boolean(p.is_active),
        })
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [open, productId])

  const set = (key: keyof ProductFormData, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }))

  const validate = (): boolean => {
    const e: Partial<ProductFormData> = {}
    if (!form.name.trim()) e.name = t('common.required')
    if (isNaN(Number(form.sell_price)) || Number(form.sell_price) < 0) e.sell_price = 'Invalid'
    if (isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0) e.cost_price = 'Invalid'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      sku:  form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      brand_id:    form.brand_id    ? Number(form.brand_id)    : null,
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      cost_price:  Number(form.cost_price),
      sell_price:  Number(form.sell_price),
      stock_quantity:      Number(form.stock_quantity),
      low_stock_threshold: Number(form.low_stock_threshold),
      unit: form.unit,
      is_active: form.is_active ? 1 : 0,
    }
    const res = productId
      ? await window.electronAPI.products.update(productId, payload)
      : await window.electronAPI.products.create(payload)
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    onSaved()
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      size="xl"
      title={productId ? t('inventory.editProduct') : t('inventory.addProduct')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving || loading}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div className="col-span-2">
            <FieldLabel required>{t('common.name')}</FieldLabel>
            <FieldInput value={form.name} onChange={v => set('name', v)} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
          </div>

          {/* SKU & Barcode */}
          <div>
            <FieldLabel>{t('inventory.sku')}</FieldLabel>
            <FieldInput value={form.sku} onChange={v => set('sku', v)} />
          </div>
          <div>
            <FieldLabel>{t('inventory.barcode')}</FieldLabel>
            <FieldInput value={form.barcode} onChange={v => set('barcode', v)} />
          </div>

          {/* Category & Brand */}
          <div>
            <FieldLabel>{t('inventory.category')}</FieldLabel>
            <FieldSelect value={form.category_id} onChange={v => set('category_id', v)} options={categories} />
          </div>
          <div>
            <FieldLabel>{t('inventory.brand')}</FieldLabel>
            <FieldSelect value={form.brand_id} onChange={v => set('brand_id', v)} options={brands} />
          </div>

          {/* Supplier */}
          <div className="col-span-2">
            <FieldLabel>{t('inventory.supplier')}</FieldLabel>
            <FieldSelect value={form.supplier_id} onChange={v => set('supplier_id', v)} options={suppliers} />
          </div>

          {/* Prices */}
          <div>
            <FieldLabel required>{t('inventory.sellPrice')}</FieldLabel>
            <FieldInput value={form.sell_price} onChange={v => set('sell_price', v)} type="number" />
            {errors.sell_price && <p className="text-destructive text-xs mt-1">{errors.sell_price}</p>}
          </div>
          <div>
            <FieldLabel>{t('inventory.costPrice')}</FieldLabel>
            <FieldInput value={form.cost_price} onChange={v => set('cost_price', v)} type="number" />
          </div>

          {/* Stock */}
          <div>
            <FieldLabel>{t('inventory.stock')}</FieldLabel>
            <FieldInput value={form.stock_quantity} onChange={v => set('stock_quantity', v)} type="number" />
          </div>
          <div>
            <FieldLabel>{t('inventory.lowStockAlert')}</FieldLabel>
            <FieldInput value={form.low_stock_threshold} onChange={v => set('low_stock_threshold', v)} type="number" />
          </div>

          {/* Unit */}
          <div>
            <FieldLabel>{t('inventory.unit')}</FieldLabel>
            <select value={form.unit} onChange={e => set('unit', e.target.value)} className={inputCls}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3 pt-6">
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4 accent-primary" />
            <label htmlFor="is_active" className="text-sm font-medium">{t('common.active')}</label>
          </div>

          {/* Description */}
          <div className="col-span-2">
            <FieldLabel>{t('common.description')}</FieldLabel>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              className={`${inputCls} resize-none`} />
          </div>
        </div>
      )}
    </Modal>
  )
}
