import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import JobNumberSettings from './JobNumberSettings'

interface JobType {
  id: number
  name: string
  description: string | null
  is_active: number
  sort_order: number
}

export default function JobTypesSettings(): JSX.Element {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'

  const [types, setTypes] = useState<JobType[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<JobType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobType | null>(null)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await window.electronAPI.jobTypes.listAll()
    if (res.success) setTypes(res.data as JobType[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!isOwner) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
        <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            {t('settings.ownerOnly', { defaultValue: 'Permission Denied' })}
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
            Only the account owner can manage job types.
          </p>
        </div>
      </div>
    )
  }

  const openAdd = () => {
    setEditTarget(null)
    setFormName('')
    setFormDesc('')
    setFormActive(true)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (jt: JobType) => {
    setEditTarget(jt)
    setFormName(jt.name)
    setFormDesc(jt.description ?? '')
    setFormActive(!!jt.is_active)
    setFormError('')
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) { setFormError(t('common.required')); return }
    setFormError('')
    setSaving(true)
    const payload = { name: formName.trim(), description: formDesc.trim() || undefined, is_active: formActive }

    const res = editTarget
      ? await window.electronAPI.jobTypes.update(editTarget.id, payload)
      : await window.electronAPI.jobTypes.create(payload)

    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setFormOpen(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.jobTypes.delete(deleteTarget.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteTarget(null)
    load()
  }

  const handleToggle = async (jt: JobType) => {
    const res = await window.electronAPI.jobTypes.update(jt.id, { is_active: !jt.is_active })
    if (res.success) load()
    else toast.error(res.error ?? t('common.error'))
  }

  const handleReorder = async (id: number, direction: 'up' | 'down') => {
    const res = await window.electronAPI.jobTypes.reorder(id, direction)
    if (res.success) load()
  }

  return (
    <div className="space-y-4">
      <JobNumberSettings />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {t('settings.jobTypes', { defaultValue: 'Job Types' })}
        </h3>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          {t('settings.addJobType', { defaultValue: 'Add Job Type' })}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : types.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t('common.noData')}</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('common.description')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="text-center px-4 py-3 font-medium w-24">Order</th>
                <th className="text-end px-4 py-3 font-medium w-28">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((jt, idx) => (
                <tr key={jt.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{jt.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{jt.description ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggle(jt)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        jt.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-400'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${jt.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      {jt.is_active ? t('common.active') : t('common.inactive')}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => handleReorder(jt.id, 'up')} disabled={idx === 0}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleReorder(jt.id, 'down')} disabled={idx === types.length - 1}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(jt)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(jt)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={formOpen}
        title={editTarget
          ? t('settings.editJobType', { defaultValue: 'Edit Job Type' })
          : t('settings.addJobType', { defaultValue: 'Add Job Type' })}
        onClose={() => setFormOpen(false)}
        footer={<>
          <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('settings.jobTypeName', { defaultValue: 'Job Type Name' })} *
            </label>
            <input value={formName} onChange={e => { setFormName(e.target.value); setFormError('') }}
              placeholder="e.g. Wheel Alignment"
              className={`w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring ${formError ? 'border-destructive ring-1 ring-destructive' : 'border-input'}`} />
            {formError && <p className="text-destructive text-xs mt-1">{formError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('settings.jobTypeDescription', { defaultValue: 'Description' })}
            </label>
            <input value={formDesc} onChange={e => setFormDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm">{t('common.active')}</span>
          </label>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog open={!!deleteTarget}
        title={t('settings.deleteJobType', { defaultValue: 'Delete Job Type' })}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.\n\nNote: You cannot delete a job type that is used in existing job cards.`}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}
