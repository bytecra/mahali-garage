import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Filter } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'

interface CarBrandRow {
  id: number
  name: string
}

interface CatalogRow {
  id: number
  brand_id: number
  model: string
  service_name: string
  department: 'mechanical' | 'programming'
  price: number
  estimated_time: number | null
  active: number
  created_at: string
  brand_name: string
}

interface GroupedBlock {
  brandName: string
  model: string
  rows: CatalogRow[]
}

export default function ServiceCatalogPage(): JSX.Element {
  const { t } = useTranslation()
  const canManage = usePermission('settings.manage')

  const [brands, setBrands] = useState<CarBrandRow[]>([])
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBrandId, setFilterBrandId] = useState<string>('')
  const [filterModel, setFilterModel] = useState('')
  const [filterDept, setFilterDept] = useState<string>('')

  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<CatalogRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<CatalogRow | null>(null)
  const [saving, setSaving] = useState(false)

  const [fBrandId, setFBrandId] = useState('')
  const [fModel, setFModel] = useState('')
  const [fServiceName, setFServiceName] = useState('')
  const [fDept, setFDept] = useState<'mechanical' | 'programming'>('mechanical')
  const [fPrice, setFPrice] = useState('0')
  const [fEstMin, setFEstMin] = useState('')
  const [fActive, setFActive] = useState(true)
  const [formError, setFormError] = useState('')

  const loadBrands = useCallback(async () => {
    const res = await window.electronAPI.carBrands.list()
    if (res.success) setBrands((res.data as CarBrandRow[]) ?? [])
  }, [])

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    const filters: Record<string, unknown> = {}
    if (filterBrandId) filters.brand_id = Number(filterBrandId)
    if (filterModel.trim()) filters.model = filterModel.trim()
    if (filterDept) filters.department = filterDept
    const res = await window.electronAPI.serviceCatalog.list(filters)
    if (res.success) setRows((res.data as CatalogRow[]) ?? [])
    setLoading(false)
  }, [filterBrandId, filterModel, filterDept])

  useEffect(() => {
    void loadBrands()
  }, [loadBrands])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const grouped = useMemo((): GroupedBlock[] => {
    const out: GroupedBlock[] = []
    let cur: GroupedBlock | null = null
    for (const r of rows) {
      if (!cur || cur.brandName !== r.brand_name || cur.model !== r.model) {
        cur = { brandName: r.brand_name, model: r.model, rows: [r] }
        out.push(cur)
      } else {
        cur.rows.push(r)
      }
    }
    return out
  }, [rows])

  const openAdd = () => {
    setEditRow(null)
    setFBrandId(brands[0]?.id ? String(brands[0].id) : '')
    setFModel('')
    setFServiceName('')
    setFDept('mechanical')
    setFPrice('0')
    setFEstMin('')
    setFActive(true)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (r: CatalogRow) => {
    setEditRow(r)
    setFBrandId(String(r.brand_id))
    setFModel(r.model)
    setFServiceName(r.service_name)
    setFDept(r.department)
    setFPrice(String(r.price))
    setFEstMin(r.estimated_time != null ? String(r.estimated_time) : '')
    setFActive(!!r.active)
    setFormError('')
    setFormOpen(true)
  }

  const handleSaveForm = async () => {
    if (!fBrandId) { setFormError(t('common.required')); return }
    if (!fModel.trim() || !fServiceName.trim()) { setFormError(t('common.required')); return }
    const price = Number(fPrice)
    if (Number.isNaN(price) || price < 0) { setFormError(t('serviceCatalog.invalidPrice', { defaultValue: 'Invalid price' })); return }
    const est = fEstMin.trim() ? Number(fEstMin) : null
    if (est != null && (Number.isNaN(est) || est < 0)) { setFormError('Invalid time'); return }
    setFormError('')
    setSaving(true)
    const payload = {
      brand_id: Number(fBrandId),
      model: fModel.trim(),
      service_name: fServiceName.trim(),
      department: fDept,
      price,
      estimated_time: est,
      active: fActive,
    }
    const res = editRow
      ? await window.electronAPI.serviceCatalog.update(editRow.id, payload)
      : await window.electronAPI.serviceCatalog.create(payload)
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setFormOpen(false)
    void loadCatalog()
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    const res = await window.electronAPI.serviceCatalog.delete(deleteRow.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteRow(null)
    void loadCatalog()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('serviceCatalog.title', { defaultValue: 'Service Catalog' })}</h1>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            disabled={brands.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {t('common.add')}
          </button>
        )}
      </div>

      {brands.length === 0 && (
        <p className="text-sm text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          {t('serviceCatalog.addBrandsFirst', { defaultValue: 'Add car brands in Settings → Car Brands before creating catalog entries.' })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">{t('common.filter')}</span>
        </div>
        <div className="min-w-[160px]">
          <label className={labelCls}>{t('serviceCatalog.brand', { defaultValue: 'Brand' })}</label>
          <select value={filterBrandId} onChange={e => setFilterBrandId(e.target.value)} className={inputCls}>
            <option value="">{t('common.all')}</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className={labelCls}>{t('serviceCatalog.model', { defaultValue: 'Model' })}</label>
          <input value={filterModel} onChange={e => setFilterModel(e.target.value)} placeholder={t('common.search')} className={inputCls} />
        </div>
        <div className="min-w-[160px]">
          <label className={labelCls}>{t('serviceCatalog.department', { defaultValue: 'Department' })}</label>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className={inputCls}>
            <option value="">{t('common.all')}</option>
            <option value="mechanical">{t('serviceCatalog.mechanical', { defaultValue: 'Mechanical' })}</option>
            <option value="programming">{t('serviceCatalog.programming', { defaultValue: 'Programming' })}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          {t('common.noData')}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(block => (
            <div key={`${block.brandName}-${block.model}`} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-muted/40 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">
                  <span className="text-primary">{block.brandName}</span>
                  <span className="text-muted-foreground font-normal mx-2">·</span>
                  <span>{block.model}</span>
                </h2>
              </div>
              <div className="divide-y divide-border">
                {block.rows.map(r => (
                  <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{r.service_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{r.department}</span>
                        {r.estimated_time != null && (
                          <span className="ms-2">~{r.estimated_time} min</span>
                        )}
                        {!r.active && <span className="ms-2 text-amber-600 dark:text-amber-400">({t('common.inactive')})</span>}
                      </p>
                    </div>
                    <div className="text-sm font-medium tabular-nums"><CurrencyText amount={r.price} /></div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => openEdit(r)} className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title={t('common.edit')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteRow(r)} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('common.delete')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editRow ? t('serviceCatalog.editService', { defaultValue: 'Edit service' }) : t('serviceCatalog.addService', { defaultValue: 'Add service' })}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button type="button" disabled={saving} onClick={() => void handleSaveForm()} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div>
            <label className={labelCls}>{t('serviceCatalog.brand', { defaultValue: 'Brand' })} *</label>
            <select value={fBrandId} onChange={e => setFBrandId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('serviceCatalog.model', { defaultValue: 'Model' })} *</label>
            <input value={fModel} onChange={e => setFModel(e.target.value)} className={inputCls} placeholder="e.g. Camry" />
          </div>
          <div>
            <label className={labelCls}>{t('serviceCatalog.serviceName', { defaultValue: 'Service name' })} *</label>
            <input value={fServiceName} onChange={e => setFServiceName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('serviceCatalog.department', { defaultValue: 'Department' })} *</label>
            <select value={fDept} onChange={e => setFDept(e.target.value as 'mechanical' | 'programming')} className={inputCls}>
              <option value="mechanical">{t('serviceCatalog.mechanical', { defaultValue: 'Mechanical' })}</option>
              <option value="programming">{t('serviceCatalog.programming', { defaultValue: 'Programming' })}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('common.price')} *</label>
              <input type="number" min={0} step="0.01" value={fPrice} onChange={e => setFPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('serviceCatalog.estMinutes', { defaultValue: 'Est. minutes' })}</label>
              <input type="number" min={0} value={fEstMin} onChange={e => setFEstMin(e.target.value)} className={inputCls} placeholder="—" />
            </div>
          </div>
          {editRow && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)} className="w-4 h-4 rounded border-input" />
              {t('common.active')}
            </label>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteRow}
        title={t('serviceCatalog.deleteService', { defaultValue: 'Delete service?' })}
        message={deleteRow ? `${deleteRow.service_name} — ${deleteRow.brand_name} ${deleteRow.model}` : ''}
        confirmLabel={t('common.delete')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  )
}
