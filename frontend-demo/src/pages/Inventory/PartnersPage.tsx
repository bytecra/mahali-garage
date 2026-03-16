import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Handshake, Phone, Mail, Globe, Search } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import EmptyState from '../../components/shared/EmptyState'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'

const PARTNER_TYPES = ['distributor', 'reseller', 'manufacturer', 'consultant', 'other'] as const
type PartnerType = typeof PARTNER_TYPES[number]

interface Partner {
  id: number
  name: string
  type: PartnerType
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  notes: string | null
  created_at: string
}

interface FormState {
  name: string; type: PartnerType; contact_name: string
  phone: string; email: string; address: string; website: string; notes: string
}

const EMPTY: FormState = {
  name: '', type: 'other', contact_name: '',
  phone: '', email: '', address: '', website: '', notes: '',
}

const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'

const TYPE_COLORS: Record<PartnerType, string> = {
  distributor:  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  reseller:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  manufacturer: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  consultant:   'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
  other:        'bg-muted text-muted-foreground',
}

export default function PartnersPage(): JSX.Element {
  const { t } = useTranslation()
  const canEdit   = usePermission('inventory.edit')
  const canDelete = usePermission('inventory.delete')

  const [items, setItems]         = useState<Partner[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Partner | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<number | null>(null)
  const [error, setError]         = useState('')

  const set = (key: keyof FormState, val: string) => setForm(f => ({ ...f, [key]: val }))

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.partners.list({
      search: search || undefined,
      type:   typeFilter || undefined,
    })
    if (res.success) setItems(res.data as Partner[])
    setLoading(false)
  }, [search, typeFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  const openEdit   = (p: Partner) => {
    setEditing(p)
    setForm({
      name: p.name, type: p.type,
      contact_name: p.contact_name ?? '', phone: p.phone ?? '',
      email: p.email ?? '', address: p.address ?? '',
      website: p.website ?? '', notes: p.notes ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('common.required')); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(), type: form.type,
      contact_name: form.contact_name || null, phone: form.phone || null,
      email: form.email || null, address: form.address || null,
      website: form.website || null, notes: form.notes || null,
    }
    const res = editing
      ? await window.electronAPI.partners.update(editing.id, payload)
      : await window.electronAPI.partners.create(payload)
    setSaving(false)
    if (!res.success) { setError(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setModalOpen(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.electronAPI.partners.delete(deleteId)
    setDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    load()
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('inventory.partners.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as PartnerType | '')}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">{t('common.all')} {t('inventory.partners.type')}</option>
          {PARTNER_TYPES.map(tp => (
            <option key={tp} value={tp}>{t(`inventory.partners.types.${tp}`)}</option>
          ))}
        </select>
        <div className="ms-auto">
          {canEdit && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />{t('inventory.partners.add')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Handshake} title={t('common.noData')} description={t('inventory.partners.emptyDesc')} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('inventory.partners.type')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('inventory.partners.contactName')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('inventory.partners.contact')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('common.notes')}</th>
                {(canEdit || canDelete) && <th className="w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(p => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{p.name}</div>
                    {p.address && <div className="text-xs text-muted-foreground mt-0.5">{p.address}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[p.type]}`}>
                      {t(`inventory.partners.types.${p.type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.contact_name || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {p.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" />{p.phone}
                        </div>
                      )}
                      {p.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />{p.email}
                        </div>
                      )}
                      {p.website && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Globe className="w-3 h-3" />
                          <a href={p.website} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline truncate max-w-[160px]">
                            {p.website.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      )}
                      {!p.phone && !p.email && !p.website && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{p.notes || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        title={editing ? t('inventory.partners.edit') : t('inventory.partners.add')}
        onClose={() => setModalOpen(false)}
        size="lg"
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
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} autoFocus />
            {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('inventory.partners.type')}</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
              {PARTNER_TYPES.map(tp => (
                <option key={tp} value={tp}>{t(`inventory.partners.types.${tp}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('inventory.partners.contactName')}</label>
            <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('customers.phone')}</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('customers.email')}</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('inventory.partners.website')}</label>
            <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('customers.address')}</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title={t('common.delete')}
        message={t('inventory.partners.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
