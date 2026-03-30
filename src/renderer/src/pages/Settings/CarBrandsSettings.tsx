import { useState, useEffect, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { cn } from '../../lib/utils'

interface CarBrand {
  id: number
  name: string
  logo: string | null
  created_at: string
}

const MAX_LOGO_BYTES = 1_500_000

export default function CarBrandsSettings(): JSX.Element {
  const { t } = useTranslation()
  const [brands, setBrands] = useState<CarBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CarBrand | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CarBrand | null>(null)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formLogo, setFormLogo] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await window.electronAPI.carBrands.list()
    if (res.success) setBrands((res.data as CarBrand[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditTarget(null)
    setFormName('')
    setFormLogo(null)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (b: CarBrand) => {
    setEditTarget(b)
    setFormName(b.name)
    setFormLogo(b.logo)
    setFormError('')
    setFormOpen(true)
  }

  const onLogoPick = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) {
      toast.error('Please choose an image')
      return
    }
    if (f.size > MAX_LOGO_BYTES) {
      toast.error('Image too large (max ~1.5 MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setFormLogo(reader.result)
    }
    reader.readAsDataURL(f)
  }

  const handleSave = async () => {
    if (!formName.trim()) { setFormError(t('common.required')); return }
    setFormError('')
    setSaving(true)
    const payload = { name: formName.trim(), logo: formLogo }
    const res = editTarget
      ? await window.electronAPI.carBrands.update(editTarget.id, payload)
      : await window.electronAPI.carBrands.create(payload)
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setFormOpen(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.carBrands.delete(deleteTarget.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteTarget(null)
    load()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Brands are matched to vehicles by name (e.g. Toyota) for the service catalog and quick job lines.
        </p>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('common.add')} brand
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {brands.map(b => (
          <div
            key={b.id}
            className={cn(
              'relative rounded-xl border-2 border-border bg-card p-4 flex flex-col items-center text-center gap-2',
              'hover:border-primary/50 hover:shadow-sm transition-all min-h-[140px]',
            )}
          >
            <button
              type="button"
              onClick={() => openEdit(b)}
              className="absolute top-2 end-2 p-1 rounded-md hover:bg-muted text-muted-foreground"
              title={t('common.edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(b)}
              className="absolute top-2 start-2 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {b.logo ? (
              <img src={b.logo} alt="" className="h-12 w-12 object-contain rounded-lg border border-border bg-background p-1 mt-4" />
            ) : (
              <div className="h-12 w-12 rounded-lg border border-dashed border-border flex items-center justify-center text-lg font-bold text-muted-foreground mt-4 bg-muted/30">
                {b.name.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-sm font-semibold text-foreground leading-tight px-2">{b.name}</p>
          </div>
        ))}
      </div>

      <Modal
        open={formOpen}
        title={editTarget ? `${t('common.edit')} brand` : `${t('common.add')} brand`}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div>
            <label className={labelCls}>Name</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} className={inputCls} placeholder="e.g. Toyota" />
          </div>
          <div>
            <label className={labelCls}>Logo</label>
            <div className="flex flex-wrap items-center gap-3">
              {formLogo ? (
                <img src={formLogo} alt="" className="h-16 w-16 object-contain rounded-lg border border-border p-1" />
              ) : (
                <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-muted/20" />
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md cursor-pointer hover:bg-muted">
                <Upload className="w-4 h-4" />
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={onLogoPick} />
              </label>
              {formLogo && (
                <button type="button" className="text-sm text-destructive" onClick={() => setFormLogo(null)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.delete')}
        message={deleteTarget ? `Delete brand "${deleteTarget.name}"? Services in the catalog for this brand will be removed.` : ''}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
