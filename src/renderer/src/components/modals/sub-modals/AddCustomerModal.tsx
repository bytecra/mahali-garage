import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import { toast } from '../../../store/notificationStore'

export interface CustomerFormShape {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

export default function AddCustomerModal(props: {
  open: boolean
  /** When set, update this customer instead of creating */
  customerToEdit: CustomerFormShape | null
  onClose: () => void
  onSaved: (customer: CustomerFormShape) => void
}): JSX.Element | null {
  const { open, customerToEdit, onClose, onSaved } = props
  const isEdit = customerToEdit != null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (customerToEdit) {
      void (async () => {
        const res = await window.electronAPI.customers.getById(customerToEdit.id)
        if (!res.success || !res.data) {
          toast.error('Could not load customer')
          return
        }
        const d = res.data as Record<string, unknown>
        setName(String(d.name ?? ''))
        setPhone(String(d.phone ?? ''))
        setEmail(d.email != null ? String(d.email) : '')
        setAddress(d.address != null ? String(d.address) : '')
      })()
    } else {
      setName('')
      setPhone('')
      setEmail('')
      setAddress('')
    }
  }, [open, customerToEdit?.id])

  const handleClose = (): void => {
    if (!saving) onClose()
  }

  const save = async (): Promise<void> => {
    const n = name.trim()
    const p = phone.trim()
    if (!n || !p) {
      toast.error('Name and phone are required')
      return
    }
    setSaving(true)
    try {
      if (isEdit && customerToEdit) {
        const res = await window.electronAPI.customers.update(customerToEdit.id, {
          name: n,
          phone: p,
          email: email.trim() || null,
          address: address.trim() || null,
        })
        setSaving(false)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? 'Failed to update customer')
          return
        }
        toast.success('Customer updated')
        onSaved({
          id: customerToEdit.id,
          name: n,
          phone: p,
          email: email.trim() || null,
          address: address.trim() || null,
        })
        onClose()
        return
      }

      const res = await window.electronAPI.customers.create({
        name: n,
        phone: p,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: null,
        balance: 0,
      })
      setSaving(false)
      if (!res.success || !res.data) {
        toast.error((res as { error?: string }).error ?? 'Failed')
        return
      }
      const id = (res.data as { id: number }).id
      toast.success('Customer created')
      onSaved({ id, name: n, phone: p, email: email.trim() || null, address: address.trim() || null })
      onClose()
    } catch {
      setSaving(false)
      toast.error(isEdit ? 'Failed to update customer' : 'Failed to create customer')
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background'

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit customer' : 'New customer'}
      onClose={handleClose}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone *</label>
          <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <textarea className={inputCls} rows={2} value={address} onChange={e => setAddress(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
