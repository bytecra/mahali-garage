import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'

type Template = {
  id: number
  name: string
  scope: 'invoice' | 'line' | 'service'
  duration_months: number | null
  service_catalog_id: number | null
  notes: string | null
  sort_order: number
  is_active: number
}

export default function WarrantyTemplatesSettings(): JSX.Element {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'

  const [rows, setRows] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [scope, setScope] = useState<'invoice' | 'line' | 'service'>('invoice')
  const [durationMonths, setDurationMonths] = useState('')
  const [catalogId, setCatalogId] = useState('')
  const [notes, setNotes] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    const res = await window.electronAPI.jobCards.listWarrantyTemplates(false)
    if (res.success && Array.isArray(res.data)) setRows(res.data as Template[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  if (!isOwner) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
        <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Permission denied</p>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
            Only the account owner can manage warranty templates.
          </p>
        </div>
      </div>
    )
  }

  const openAdd = (): void => {
    setEditTarget(null)
    setName('')
    setScope('invoice')
    setDurationMonths('')
    setCatalogId('')
    setNotes('')
    setSortOrder('0')
    setActive(true)
    setFormOpen(true)
  }

  const openEdit = (t: Template): void => {
    setEditTarget(t)
    setName(t.name)
    setScope(t.scope)
    setDurationMonths(t.duration_months != null ? String(t.duration_months) : '')
    setCatalogId(t.service_catalog_id != null ? String(t.service_catalog_id) : '')
    setNotes(t.notes ?? '')
    setSortOrder(String(t.sort_order ?? 0))
    setActive(!!t.is_active)
    setFormOpen(true)
  }

  const handleSave = async (): Promise<void> => {
    const n = name.trim()
    if (!n) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const dm = durationMonths.trim() ? Number(durationMonths) : null
      const cat = catalogId.trim() ? Number(catalogId) : null
      if (editTarget) {
        const res = await window.electronAPI.jobCards.updateWarrantyTemplate(editTarget.id, {
          name: n,
          scope,
          duration_months: dm,
          service_catalog_id: cat,
          notes: notes.trim() || null,
          sort_order: Number(sortOrder) || 0,
          is_active: active,
        })
        setSaving(false)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? 'Failed')
          return
        }
        toast.success('Saved')
      } else {
        const res = await window.electronAPI.jobCards.createWarrantyTemplate({
          name: n,
          scope,
          duration_months: dm,
          service_catalog_id: cat,
          notes: notes.trim() || null,
          sort_order: Number(sortOrder) || 0,
        })
        setSaving(false)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? 'Failed')
          return
        }
        toast.success('Created')
      }
      setFormOpen(false)
      void load()
    } catch {
      setSaving(false)
      toast.error('Failed')
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const res = await window.electronAPI.jobCards.deleteWarrantyTemplate(deleteTarget.id)
    if (!res.success) {
      toast.error((res as { error?: string }).error ?? 'Failed')
      return
    }
    toast.success('Deleted')
    setDeleteTarget(null)
    void load()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Warranty templates</h2>
          <p className="text-sm text-muted-foreground">
            Reusable terms for whole invoices, single lines, or catalog services. Apply when generating a job invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add template
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-8 text-center">No templates yet.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-3 py-2">Name</th>
                <th className="text-start px-3 py-2">Scope</th>
                <th className="text-end px-3 py-2">Months</th>
                <th className="text-center px-3 py-2">Active</th>
                <th className="text-end px-3 py-2 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(t => (
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 capitalize">{t.scope}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{t.duration_months ?? '—'}</td>
                  <td className="px-3 py-2 text-center">{t.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-end">
                    <button type="button" className="p-1.5 rounded hover:bg-muted" onClick={() => openEdit(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="p-1.5 rounded hover:bg-destructive/10 text-destructive" onClick={() => setDeleteTarget(t)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editTarget ? 'Edit warranty template' : 'New warranty template'}
        onClose={() => setFormOpen(false)}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={() => void handleSave()} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">Name *</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Applies to</label>
            <select className={inputCls} value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
              <option value="invoice">Whole invoice</option>
              <option value="line">Job line item</option>
              <option value="service">Service (catalog)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Duration (months)</label>
            <input type="number" min={0} className={inputCls} value={durationMonths} onChange={e => setDurationMonths(e.target.value)} placeholder="12" />
          </div>
          {scope === 'service' ? (
            <div>
              <label className="block text-xs font-medium mb-1">Service catalog ID (optional default)</label>
              <input className={inputCls} value={catalogId} onChange={e => setCatalogId(e.target.value)} placeholder="ID from Service catalog" />
            </div>
          ) : null}
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea className={inputCls} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Sort order</label>
              <input type="number" className={inputCls} value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                Active
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete template?"
        message="Job invoices that already used this template keep their warranty text; only the template is removed."
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
