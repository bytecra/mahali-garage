import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Package, AlertTriangle, ArrowUpDown, History } from 'lucide-react'
import SearchInput from '../../components/shared/SearchInput'
import Pagination from '../../components/shared/Pagination'
import EmptyState from '../../components/shared/EmptyState'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'
import { useDebounce } from '../../hooks/useDebounce'
import { formatCurrency } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import ProductForm from './ProductForm'
import StockAdjustmentModal from './StockAdjustmentModal'

interface Product {
  id: number; name: string; sku: string | null; barcode: string | null
  category_name: string | null; brand_name: string | null; sell_price: number
  cost_price: number; stock_quantity: number; low_stock_threshold: number
  unit: string; is_active: number
}

export default function ProductsPage(): JSX.Element {
  const { t } = useTranslation()
  const canEdit   = usePermission('inventory.edit')
  const canDelete = usePermission('inventory.delete')
  const canAdjust = usePermission('inventory.adjust_stock')

  const [items, setItems]             = useState<Product[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [categoryId, setCategoryId]   = useState<number | ''>('')
  const [categories, setCategories]   = useState<{ id: number; name: string }[]>([])
  const dSearch                       = useDebounce(search)
  const [formOpen, setFormOpen]       = useState(false)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [deleteId, setDeleteId]       = useState<number | null>(null)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.products.list({
      search: dSearch,
      category_id: categoryId || undefined,
      page,
    })
    if (res.success) {
      const d = res.data as { items: Product[]; total: number }
      setItems(d.items)
      setTotal(d.total)
    }
    setLoading(false)
  }, [dSearch, categoryId, page])

  useEffect(() => {
    window.electronAPI.categories.list().then(r => {
      if (r.success) setCategories(r.data as { id: number; name: string }[])
    })
  }, [])

  useEffect(() => { setPage(1) }, [dSearch, categoryId])
  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.electronAPI.products.delete(deleteId)
    setDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    load()
  }

  const openCreate = () => { setEditingId(null); setFormOpen(true) }
  const openEdit   = (id: number) => { setEditingId(id); setFormOpen(true) }

  const isLow = (p: Product) => p.stock_quantity <= p.low_stock_threshold

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} className="w-64" />
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('inventory.category')} — {t('common.all')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="ms-auto">
          {canEdit && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
              <Plus className="w-4 h-4" />{t('inventory.addProduct')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title={t('common.noData')}
          action={canEdit ? <button onClick={openCreate} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">{t('inventory.addProduct')}</button> : undefined}
        />
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('inventory.sku')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('inventory.category')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('inventory.sellPrice')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('inventory.costPrice')}</th>
                  <th className="text-center px-4 py-3 font-medium">{t('inventory.stock')}</th>
                  <th className="w-28 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.barcode && <p className="text-xs text-muted-foreground">{item.barcode}</p>}
                        </div>
                        {isLow(item) && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.sku || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category_name || '—'}</td>
                    <td className="px-4 py-3 text-end font-medium text-foreground"><CurrencyText amount={item.sell_price} /></td>
                    <td className="px-4 py-3 text-end text-muted-foreground"><CurrencyText amount={item.cost_price} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center min-w-8 h-6 px-2 rounded-full text-xs font-medium ${
                        isLow(item)
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                      }`}>
                        {item.stock_quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canAdjust && (
                          <button onClick={() => setAdjustProduct(item)} title={t('inventory.adjustStock')}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => openEdit(item.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={25} total={total} onChange={setPage} />
        </>
      )}

      {/* Product form modal */}
      <ProductForm
        open={formOpen}
        productId={editingId}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
      />

      {/* Stock adjustment modal */}
      {adjustProduct && (
        <StockAdjustmentModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSaved={() => { setAdjustProduct(null); load() }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={t('common.delete')}
        message="This will archive the product. Sales history is preserved."
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
