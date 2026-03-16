import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Truck, Phone, Mail } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import EmptyState from '../../components/shared/EmptyState'
import SearchInput from '../../components/shared/SearchInput'
import Pagination from '../../components/shared/Pagination'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'
import { useDebounce } from '../../hooks/useDebounce'

interface Supplier {
  id: number; name: string; contact_name: string | null; phone: string | null
  email: string | null; address: string | null; notes: string | null; product_count: number
}

interface FormState { name: string; contact_name: string; phone: string; email: string; address: string; notes: string }
const EMPTY: FormState = { name: '', contact_name: '', phone: '', email: '', address: '', notes: '' }

export default function SuppliersPage(): JSX.Element {
  const { t } = useTranslation()
  const canEdit   = usePermission('inventory.edit')
  const canDelete = usePermission('inventory.delete')

  const [items, setItems]         = useState<Supplier[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const dSearch                   = useDebounce(search)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Supplier | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<number | null>(null)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.suppliers.list({ search: dSearch, page })
    if (res.success) {
      const d = res.data as { items: Supplier[]; total: number }
      setItems(d.items)
      setTotal(d.total)
    }
    setLoading(false)
  }, [dSearch, page])

  useEffect(() => { setPage(1) }, [dSearch])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  const openEdit = (s: Supplier) => {
    setEditing(s)
    setForm({ name: s.name, contact_name: s.contact_name ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' })
    setError(''); setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('common.required')); return }
    setSaving(true)
    const payload = { ...form, contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null }
    const res = editing
      ? await window.electronAPI.suppliers.update(editing.id, payload)
      : await window.electronAPI.suppliers.create(payload)
    setSaving(false)
    if (!res.success) { setError(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setModalOpen(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.electronAPI.suppliers.delete(deleteId)
    setDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    load()
  }

  const field = (label: string, key: keyof FormState, type = 'text') => (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} className="w-64" />
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" />{t('inventory.suppliers')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Truck} title={t('common.noData')} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                  <th className="text-start px-4 py-3 font-medium">Contact</th>
                  <th className="text-start px-4 py-3 font-medium">{t('customers.phone')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('inventory.products')}</th>
                  {(canEdit || canDelete) && <th className="w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.contact_name || '—'}</td>
                    <td className="px-4 py-3">
                      {item.phone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3" />{item.phone}</span>}
                      {item.email && <span className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" />{item.email}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">{item.product_count}</span>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canEdit && <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>}
                          {canDelete && <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={25} total={total} onChange={setPage} />
        </>
      )}

      <Modal open={modalOpen} size="lg"
        title={editing ? `${t('common.edit')} ${t('inventory.suppliers')}` : `${t('common.add')} ${t('inventory.suppliers')}`}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">{t('common.name')} *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" autoFocus />
            {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          </div>
          {field('Contact Name', 'contact_name')}
          {field(t('customers.phone'), 'phone', 'tel')}
          {field(t('customers.email'), 'email', 'email')}
          {field(t('customers.address'), 'address')}
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} title={t('common.delete')} message="Delete this supplier?"
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  )
}
