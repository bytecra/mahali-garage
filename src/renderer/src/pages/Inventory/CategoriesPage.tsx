import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import EmptyState from '../../components/shared/EmptyState'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'

interface Category { id: number; name: string; description: string | null; product_count: number }

interface FormState { name: string; description: string }
const EMPTY_FORM: FormState = { name: '', description: '' }

export default function CategoriesPage(): JSX.Element {
  const { t } = useTranslation()
  const canEdit   = usePermission('inventory.edit')
  const canDelete = usePermission('inventory.delete')

  const [items, setItems]         = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Category | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<number | null>(null)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.categories.list()
    if (res.success) setItems(res.data as Category[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true) }
  const openEdit   = (c: Category) => { setEditing(c); setForm({ name: c.name, description: c.description ?? '' }); setError(''); setModalOpen(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('common.required')); return }
    setSaving(true)
    const res = editing
      ? await window.electronAPI.categories.update(editing.id, form)
      : await window.electronAPI.categories.create(form)
    setSaving(false)
    if (!res.success) { setError(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setModalOpen(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.electronAPI.categories.delete(deleteId)
    setDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    load()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            {t('common.add')} {t('inventory.categories')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Tag} title={t('common.noData')} action={canEdit ? <button onClick={openCreate} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">{t('common.add')}</button> : undefined} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('common.description')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('inventory.products')}</th>
                {(canEdit || canDelete) && <th className="w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.description || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {item.product_count}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
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

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        title={editing ? `${t('common.edit')} ${t('inventory.categories')}` : `${t('common.add')} ${t('inventory.categories')}`}
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('common.name')} *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('common.description')}</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title={t('common.delete')}
        message={`Delete this category?`}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
