import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'

interface FormData { name: string; phone: string; email: string; address: string; notes: string }
const EMPTY: FormData = { name: '', phone: '', email: '', address: '', notes: '' }

interface Props { open: boolean; customerId: number | null; onClose: () => void; onSaved: () => void }

export default function CustomerForm({ open, customerId, onClose, onSaved }: Props): JSX.Element | null {
  const { t } = useTranslation()
  const [form, setForm]     = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (customerId) {
      setLoading(true)
      window.electronAPI.customers.getById(customerId).then(res => {
        setLoading(false)
        if (!res.success || !res.data) return
        const c = res.data as Record<string, unknown>
        setForm({
          name: String(c.name ?? ''), phone: String(c.phone ?? ''),
          email: String(c.email ?? ''), address: String(c.address ?? ''),
          notes: String(c.notes ?? ''),
        })
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, customerId])

  const set = (key: keyof FormData, v: string) => setForm(f => ({ ...f, [key]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('common.required')); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null, email: form.email || null,
      address: form.address || null, notes: form.notes || null,
    }
    const res = customerId
      ? await window.electronAPI.customers.update(customerId, payload)
      : await window.electronAPI.customers.create(payload)
    setSaving(false)
    if (!res.success) { setError(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    onSaved()
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      title={customerId ? t('customers.editCustomer') : t('customers.addCustomer')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving || loading}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('common.name')} *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} autoFocus
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            {error && <p className="text-destructive text-xs mt-1">{error}</p>}
          </div>
          {(['phone', 'email', 'address'] as const).map(key => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1.5 capitalize">{t(`customers.${key}`)}</label>
              <input type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={e => set(key, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        </div>
      )}
    </Modal>
  )
}
