import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { usePermission } from '../../hooks/usePermission'
import { formatCurrency, formatDate } from '../../lib/utils'
import { toast } from '../../store/notificationStore'
import { Plus, Trash2, Edit2, Search, Building2 } from 'lucide-react'

const PRESET_CATEGORIES = ['Equipment', 'Tools', 'Machinery', 'Furniture', 'Software', 'Vehicle']

const OTHER_KEY = '__other__'

interface Asset {
  id: number
  name: string
  category: string
  purchase_date: string
  purchase_price: number
  current_value: number | null
  description: string | null
  notes: string | null
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  categoryKey: PRESET_CATEGORIES[0],
  categoryCustom: '',
  purchase_date: new Date().toISOString().slice(0, 10),
  purchase_price: '',
  current_value: '',
  description: '',
  notes: '',
}

export default function AssetsPage(): JSX.Element {
  return <AssetsPageInner />
}

function AssetsPageInner(): JSX.Element {
  const { t } = useTranslation()
  const canAdd = usePermission('assets.add')
  const canDelete = usePermission('assets.delete')

  const [assets, setAssets] = useState<Asset[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [purchaseSumFiltered, setPurchaseSumFiltered] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [dbCategories, setDbCategories] = useState<string[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const filterOptions = useMemo(() => {
    const set = new Set<string>([...PRESET_CATEGORIES, ...dbCategories])
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [dbCategories])

  const categorySelectOptions = useMemo(() => {
    const set = new Set<string>([...PRESET_CATEGORIES, ...dbCategories])
    return [...Array.from(set).sort((a, b) => a.localeCompare(b)), OTHER_KEY]
  }, [dbCategories])

  const loadCategories = useCallback(async () => {
    const res = await window.electronAPI.assets.categories()
    if (res.success && res.data) setDbCategories(res.data as string[])
  }, [])

  const loadAssets = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.assets.list({
      search: search.trim() || undefined,
      category: catFilter || undefined,
      limit: 500,
    })
    setLoading(false)
    if (res.success && res.data) {
      const d = res.data as { rows: Asset[]; total: number; purchaseSumFiltered: number }
      setAssets(d.rows)
      setTotalCount(d.total)
      setPurchaseSumFiltered(d.purchaseSumFiltered)
    }
  }, [search, catFilter])

  useEffect(() => { void loadCategories() }, [loadCategories])
  useEffect(() => { void loadAssets() }, [loadAssets])

  function effectiveCategoryFromForm(): string {
    if (form.categoryKey === OTHER_KEY) return form.categoryCustom.trim()
    return form.categoryKey
  }

  function openAdd(): void {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  function openEdit(row: Asset): void {
    setEditId(row.id)
    const presetLike = categorySelectOptions.filter(k => k !== OTHER_KEY)
    const hasPreset = presetLike.includes(row.category)
    setForm({
      name: row.name,
      categoryKey: hasPreset ? row.category : OTHER_KEY,
      categoryCustom: hasPreset ? '' : row.category,
      purchase_date: row.purchase_date.slice(0, 10),
      purchase_price: String(row.purchase_price),
      current_value: row.current_value != null ? String(row.current_value) : '',
      description: row.description ?? '',
      notes: row.notes ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave(): Promise<void> {
    const cat = effectiveCategoryFromForm()
    if (!form.name.trim()) {
      toast.error(t('assets.nameRequired', { defaultValue: 'Name is required' }))
      return
    }
    if (!cat) {
      toast.error(t('assets.categoryRequired', { defaultValue: 'Category is required' }))
      return
    }
    const pp = parseFloat(form.purchase_price)
    if (Number.isNaN(pp) || pp < 0) {
      toast.error(t('assets.priceRequired', { defaultValue: 'Enter a valid purchase price' }))
      return
    }
    if (!form.purchase_date) {
      toast.error(t('assets.dateRequired', { defaultValue: 'Purchase date is required' }))
      return
    }
    const cvRaw = form.current_value.trim()
    const cv = cvRaw === '' ? null : parseFloat(cvRaw)
    if (cv != null && (Number.isNaN(cv) || cv < 0)) {
      toast.error(t('assets.currentValueInvalid', { defaultValue: 'Current value must be a valid number' }))
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: cat,
      purchase_date: form.purchase_date,
      purchase_price: pp,
      current_value: cv,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    }
    const res = editId
      ? await window.electronAPI.assets.update(editId, payload)
      : await window.electronAPI.assets.create(payload)
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      return
    }
    toast.success(t('common.success'))
    setModalOpen(false)
    void loadCategories()
    void loadAssets()
  }

  async function handleDelete(): Promise<void> {
    if (!deleteId) return
    const res = await window.electronAPI.assets.delete(deleteId)
    setDeleteId(null)
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      return
    }
    toast.success(t('common.deleted'))
    void loadCategories()
    void loadAssets()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('assets.title', { defaultValue: 'Assets' })}</h1>
        {canAdd && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('assets.addAsset', { defaultValue: 'Add asset' })}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 min-w-[12rem]">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('assets.totalValueFiltered', { defaultValue: 'Total purchase value (filtered)' })}
            </p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(purchaseSumFiltered)}</p>
            <p className="text-xs text-muted-foreground">
              {totalCount}{' '}
              {t('assets.items', { defaultValue: 'items' })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className={`${inputCls} ps-9`}
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background min-w-[10rem]"
        >
          <option value="">{t('assets.allCategories', { defaultValue: 'All categories' })}</option>
          {filterOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('assets.category', { defaultValue: 'Category' })}</th>
                <th className="text-start px-4 py-3 font-medium">{t('assets.purchaseDate', { defaultValue: 'Purchase date' })}</th>
                <th className="text-end px-4 py-3 font-medium">{t('assets.purchasePrice', { defaultValue: 'Purchase price' })}</th>
                <th className="text-end px-4 py-3 font-medium">{t('assets.currentValue', { defaultValue: 'Current value' })}</th>
                {(canAdd || canDelete) && (
                  <th className="text-end px-4 py-3 font-medium w-28">{t('common.actions', { defaultValue: 'Actions' })}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={(canAdd || canDelete) ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                assets.map(a => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(a.purchase_date)}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{formatCurrency(a.purchase_price)}</td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {a.current_value != null ? formatCurrency(a.current_value) : '—'}
                    </td>
                    {(canAdd || canDelete) && (
                      <td className="px-4 py-3 text-end">
                        <div className="flex justify-end gap-1">
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() => openEdit(a)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted"
                              aria-label={t('common.edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteId(a.id)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                              aria-label={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editId ? t('assets.editAsset', { defaultValue: 'Edit asset' }) : t('assets.addAsset', { defaultValue: 'Add asset' })}
        onClose={() => setModalOpen(false)}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t('common.name')} *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('assets.category', { defaultValue: 'Category' })} *</label>
              <select
                className={inputCls}
                value={form.categoryKey}
                onChange={e => setForm(f => ({ ...f, categoryKey: e.target.value }))}
              >
                {categorySelectOptions.filter(k => k !== OTHER_KEY).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={OTHER_KEY}>{t('assets.otherCategory', { defaultValue: 'Other…' })}</option>
              </select>
            </div>
            {form.categoryKey === OTHER_KEY && (
              <div>
                <label className={labelCls}>{t('assets.customCategory', { defaultValue: 'Custom category' })} *</label>
                <input
                  className={inputCls}
                  value={form.categoryCustom}
                  onChange={e => setForm(f => ({ ...f, categoryCustom: e.target.value }))}
                  placeholder={t('assets.categoryPlaceholder', { defaultValue: 'e.g. Workshop' })}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('assets.purchaseDate', { defaultValue: 'Purchase date' })} *</label>
              <input
                type="date"
                className={inputCls}
                value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>{t('assets.purchasePrice', { defaultValue: 'Purchase price' })} *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.purchase_price}
                onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('assets.currentValue', { defaultValue: 'Current value' })}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.current_value}
              onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))}
              placeholder={t('assets.optional', { defaultValue: 'Optional' })}
            />
          </div>
          <div>
            <label className={labelCls}>{t('common.description')}</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>{t('common.notes')}</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        title={t('assets.deleteTitle', { defaultValue: 'Delete asset?' })}
        message={t('assets.deleteMessage', { defaultValue: 'This cannot be undone.' })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
