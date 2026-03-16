import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Cog, Pencil, Trash2 } from 'lucide-react'
import SearchInput from '../../components/shared/SearchInput'
import EmptyState from '../../components/shared/EmptyState'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { FeatureGate } from '../../components/FeatureGate'
import { usePermission } from '../../hooks/usePermission'
import { useDebounce } from '../../hooks/useDebounce'
import { formatCurrency } from '../../lib/utils'
import { toast } from '../../store/notificationStore'

interface Service {
  id: number; name: string; description: string | null; category: string | null
  estimated_time: number | null; price: number; is_active: number
}

interface ServiceFormData {
  name: string; description: string; category: string
  estimated_time: string; price: string; is_active: boolean
}

const emptyForm: ServiceFormData = {
  name: '', description: '', category: '', estimated_time: '', price: '0', is_active: true,
}

function ServicesInner(): JSX.Element {
  const { t } = useTranslation()
  const canEdit = usePermission('settings.manage')

  const [items, setItems] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<ServiceFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)
  const [categories, setCategories] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [res, catRes] = await Promise.all([
      window.electronAPI.services.list({ search: dSearch }),
      window.electronAPI.services.getCategories(),
    ])
    if (res.success) setItems((res.data as { items: Service[] }).items)
    if (catRes.success) setCategories(catRes.data as string[])
    setLoading(false)
  }, [dSearch])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditId(null); setForm(emptyForm); setFormOpen(true) }

  const openEdit = (s: Service) => {
    setEditId(s.id)
    setForm({
      name: s.name, description: s.description ?? '', category: s.category ?? '',
      estimated_time: s.estimated_time != null ? String(s.estimated_time) : '',
      price: String(s.price), is_active: !!s.is_active,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Service name is required'); return }
    setSaving(true)
    const payload = {
      name: form.name, description: form.description || null, category: form.category || null,
      estimated_time: form.estimated_time ? Number(form.estimated_time) : null,
      price: Number(form.price) || 0, is_active: form.is_active ? 1 : 0,
    }
    const res = editId
      ? await window.electronAPI.services.update(editId, payload)
      : await window.electronAPI.services.create(payload)
    setSaving(false)
    if (res.success) { toast.success(t('common.success')); setFormOpen(false); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.services.delete(deleteTarget.id)
    if (res.success) { toast.success(t('common.success')); setDeleteTarget(null); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'

  const grouped = items.reduce<Record<string, Service[]>>((acc, s) => {
    const key = s.category || 'Uncategorized'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('nav.services')}</h1>
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" />Add Service
          </button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search services..." className="w-72" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Cog} title="No services found" description="Create service packages for your garage." />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, services]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {services.map(s => (
                  <div key={s.id} className={`bg-card border border-border rounded-lg p-4 ${!s.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-foreground">{s.name}</h3>
                      <div className="flex gap-1">
                        {canEdit && <button onClick={() => openEdit(s)} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                        {canEdit && <button onClick={() => setDeleteTarget(s)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
                      </div>
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{s.description}</p>}
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-primary">{formatCurrency(s.price)}</span>
                      {s.estimated_time != null && <span className="text-xs text-muted-foreground">{s.estimated_time} min</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} title={editId ? 'Edit Service' : 'Add Service'} onClose={() => setFormOpen(false)} size="md"
        footer={<>
          <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">{saving ? t('common.loading') : t('common.save')}</button>
        </>}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Service Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Oil Change" /></div>
          <div><label className="block text-sm font-medium mb-1">{t('common.description')}</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Category</label>
              <input list="service-categories" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls} placeholder="e.g. Maintenance" />
              <datalist id="service-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div><label className="block text-sm font-medium mb-1">{t('common.price')}</label><input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Estimated Time (min)</label><input type="number" min="0" value={form.estimated_time} onChange={e => setForm(f => ({ ...f, estimated_time: e.target.value }))} className={inputCls} /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-primary" /><span className="text-sm">{t('common.active')}</span></label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title={t('common.delete')}
        message={`Delete service "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}

export default function ServicesPage(): JSX.Element {
  return (
    <FeatureGate feature="services.view">
      <ServicesInner />
    </FeatureGate>
  )
}
