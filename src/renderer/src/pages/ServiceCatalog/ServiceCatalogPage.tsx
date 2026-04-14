import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ArrowUpDown } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { useDebounce } from '../../hooks/useDebounce'
import Pagination from '../../components/shared/Pagination'

const DEPT_OPTIONS = [
  { value: 'mechanical', label: 'Mechanical', color: 'bg-[#0066CC]/15 text-[#0066CC] border-[#0066CC]/30' },
  { value: 'programming', label: 'Programming', color: 'bg-[#9933CC]/15 text-[#9933CC] border-[#9933CC]/30' },
  { value: 'electrical', label: 'Electrical', color: 'bg-[#FF9900]/15 text-[#FF9900] border-[#FF9900]/30' },
  { value: 'painting', label: 'Painting', color: 'bg-[#FF6666]/15 text-[#FF6666] border-[#FF6666]/30' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground border-border' },
]

const CAT_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance', color: 'bg-[#00CC66]/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30' },
  { value: 'repair', label: 'Repair', color: 'bg-[#FF6600]/15 text-orange-800 dark:text-orange-300 border-orange-500/30' },
  { value: 'diagnostic', label: 'Diagnostic', color: 'bg-[#3366FF]/15 text-blue-800 dark:text-blue-300 border-blue-500/30' },
  { value: 'customization', label: 'Customization', color: 'bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-500/30' },
  { value: 'other', label: 'Other', color: 'bg-muted text-muted-foreground border-border' },
]

interface CatalogRow {
  id: number
  service_name: string
  description: string | null
  default_price: number
  price: number
  department: string
  category: string | null
  estimated_time: number | null
  active: number
}

function deptBadge(dept: string): string {
  return DEPT_OPTIONS.find(d => d.value === dept)?.color ?? DEPT_OPTIONS[4].color
}

function catBadge(cat: string | null): string {
  if (!cat) return 'bg-muted text-muted-foreground border-border'
  return CAT_OPTIONS.find(c => c.value === cat)?.color ?? 'bg-muted text-muted-foreground border-border'
}

export default function ServiceCatalogPage(): JSX.Element {
  const { t } = useTranslation()
  const canManage = usePermission('settings.manage')

  const [items, setItems] = useState<CatalogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search, 300)
  const [filterDept, setFilterDept] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<CatalogRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<CatalogRow | null>(null)
  const [saving, setSaving] = useState(false)

  const [fServiceName, setFServiceName] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fDept, setFDept] = useState('mechanical')
  const [fCat, setFCat] = useState('maintenance')
  const [fPrice, setFPrice] = useState('0')
  const [fEstMin, setFEstMin] = useState('')
  const [fActive, setFActive] = useState(true)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.serviceCatalog.list({
      search: dSearch.trim(),
      department: filterDept || undefined,
      category: filterCat || undefined,
      include_inactive: showInactive,
      active_only: !showInactive,
      page,
      pageSize,
      sort_by: sortBy,
      sort_dir: sortDir,
    })
    if (res.success && res.data) {
      const d = res.data as { items: CatalogRow[]; total: number }
      setItems(d.items ?? [])
      setTotal(d.total ?? 0)
    } else {
      setItems([])
      setTotal(0)
    }
    setLoading(false)
  }, [dSearch, filterDept, filterCat, showInactive, page, pageSize, sortBy, sortDir])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [dSearch, filterDept, filterCat, showInactive, sortBy, sortDir])

  const openAdd = () => {
    setEditRow(null)
    setFServiceName('')
    setFDesc('')
    setFDept('mechanical')
    setFCat('maintenance')
    setFPrice('0')
    setFEstMin('')
    setFActive(true)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (r: CatalogRow) => {
    setEditRow(r)
    setFServiceName(r.service_name)
    setFDesc(r.description ?? '')
    setFDept(r.department || 'mechanical')
    setFCat(r.category || 'other')
    setFPrice(String(r.default_price ?? r.price ?? 0))
    setFEstMin(r.estimated_time != null ? String(r.estimated_time) : '')
    setFActive(!!r.active)
    setFormError('')
    setFormOpen(true)
  }

  const handleSaveForm = async () => {
    const name = fServiceName.trim()
    if (name.length < 3) {
      setFormError('Service name must be at least 3 characters.')
      return
    }
    const price = Number(fPrice)
    if (Number.isNaN(price) || price < 0) {
      setFormError(t('serviceCatalog.invalidPrice', { defaultValue: 'Invalid price' }))
      return
    }
    const est = fEstMin.trim() ? Number(fEstMin) : null
    if (est != null && (Number.isNaN(est) || est < 0)) {
      setFormError('Invalid estimated time')
      return
    }
    setFormError('')
    setSaving(true)
    const payload = {
      service_name: name,
      description: fDesc.trim() || null,
      default_price: price,
      department: fDept,
      category: fCat,
      estimated_time: est,
      active: fActive,
    }
    const res = editRow
      ? await window.electronAPI.serviceCatalog.update(editRow.id, payload)
      : await window.electronAPI.serviceCatalog.create(payload)
    setSaving(false)
    if (!res.success) {
      toast.error((res as { error?: string }).error ?? t('common.error'))
      return
    }
    toast.success(t('common.success'))
    setFormOpen(false)
    void load()
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    const res = await window.electronAPI.serviceCatalog.delete(deleteRow.id)
    if (!res.success) {
      toast.error((res as { error?: string }).error ?? t('common.error'))
      return
    }
    toast.success(t('common.success'))
    setDeleteRow(null)
    void load()
  }

  const toggleSort = (col: 'name' | 'price') => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  const activeCount = useMemo(() => items.filter(i => i.active).length, [items])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('serviceCatalog.title', { defaultValue: 'Service Catalog' })}</h1>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t('common.add')} Service
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4 p-4 rounded-xl border border-border bg-card">
        <div className="min-w-[180px] flex-1">
          <label className={labelCls}>Search</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name or description…"
            className={inputCls}
            aria-label="Search services"
          />
        </div>
        <div className="min-w-[140px]">
          <label className={labelCls}>Department</label>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className={inputCls}>
            <option value="">All</option>
            {DEPT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className={labelCls}>Category</label>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className={inputCls}>
            <option value="">All</option>
            {CAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded border-input" />
          Show inactive
        </label>
        <button
          type="button"
          className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted mb-0.5"
          onClick={() => {
            setSearch('')
            setFilterDept('')
            setFilterCat('')
            setShowInactive(false)
          }}
        >
          Clear
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
        Total: {total} · Showing: {items.length} on this page · Active in view: {activeCount}
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
          <p className="mb-4">No services found.</p>
          {canManage && (
            <button type="button" onClick={openAdd} className="text-primary font-medium hover:underline">
              + Add your first service
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('name')}>
                      Service name <ArrowUpDown className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </th>
                  <th className="text-start px-4 py-3 font-medium">Department</th>
                  <th className="text-start px-4 py-3 font-medium">Category</th>
                  <th className="text-end px-4 py-3 font-medium">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground ms-auto" onClick={() => toggleSort('price')}>
                      Price <ArrowUpDown className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </th>
                  <th className="text-end px-4 py-3 font-medium w-28">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 1 ? 'bg-muted/20' : ''}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.service_name}</span>
                      {r.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.description}</p>}
                      {!r.active && <span className="text-xs text-amber-600 dark:text-amber-400 ms-2">(inactive)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs border capitalize ${deptBadge(r.department)}`}>
                        {r.department}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.category && (
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs border capitalize ${catBadge(r.category)}`}>
                          {r.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums font-medium">{formatCurrency(r.default_price ?? r.price)} AED</td>
                    <td className="px-4 py-3 text-end">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openEdit(r)} className="p-2 rounded-md hover:bg-muted" title={t('common.edit')} aria-label={`Edit ${r.service_name}`}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteRow(r)} className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title={t('common.delete')} aria-label={`Deactivate ${r.service_name}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </>
      )}

      <Modal
        open={formOpen}
        title={editRow ? t('serviceCatalog.editService', { defaultValue: 'Edit service' }) : t('serviceCatalog.addService', { defaultValue: 'Add service' })}
        onClose={() => setFormOpen(false)}
        size="lg"
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
          {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          <div>
            <label className={labelCls}>Service name *</label>
            <input
              value={fServiceName}
              onChange={e => setFServiceName(e.target.value)}
              disabled={!!editRow}
              className={`${inputCls} ${editRow ? 'bg-muted/50' : ''}`}
              minLength={3}
              maxLength={100}
            />
            {editRow && <p className="text-xs text-muted-foreground mt-1">Name is locked. Deactivate and add a new service to rename.</p>}
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} maxLength={500} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Department *</label>
              <select value={fDept} onChange={e => setFDept(e.target.value)} className={inputCls}>
                {DEPT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <select value={fCat} onChange={e => setFCat(e.target.value)} className={inputCls}>
                {CAT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Default price (AED) *</label>
              <input type="number" min={0} step="0.01" value={fPrice} onChange={e => setFPrice(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('serviceCatalog.estMinutes', { defaultValue: 'Est. minutes' })}</label>
              <input type="number" min={0} value={fEstMin} onChange={e => setFEstMin(e.target.value)} className={inputCls} placeholder="—" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)} className="w-4 h-4 rounded border-input" />
            Active in catalog
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteRow}
        title="Deactivate service?"
        message={
          deleteRow
            ? `Deactivate "${deleteRow.service_name}"? It will be hidden from pickers; existing job lines and invoices keep their saved prices.`
            : ''
        }
        confirmLabel="Deactivate"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  )
}
