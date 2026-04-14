import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebounce } from '../../../hooks/useDebounce'
import { useAnyPermission } from '../../../hooks/usePermission'
import Modal from '../../shared/Modal'
import AddCustomerModal from '../sub-modals/AddCustomerModal'

interface CustomerLite {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

export default function CustomerTab(props: {
  selectedCustomer: CustomerLite | null
  onSelectCustomer: (c: CustomerLite | null) => void
  /** After name/phone/etc. are saved on the customer record */
  onCustomerUpdated?: (c: CustomerLite) => void
}): JSX.Element {
  const { selectedCustomer, onSelectCustomer, onCustomerUpdated } = props
  const canEditCustomer = useAnyPermission(['customers.edit', 'repairs.edit'])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [customerToEdit, setCustomerToEdit] = useState<CustomerLite | null>(null)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search, 300)
  const [results, setResults] = useState<CustomerLite[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.customers.list({ search: dSearch, pageSize: 100 })
      if (res.success && res.data) {
        const d = res.data as { items: CustomerLite[] }
        setResults(d.items ?? [])
      } else setResults([])
    } finally {
      setLoading(false)
    }
  }, [dSearch])

  useEffect(() => {
    if (!pickerOpen) return
    void load()
  }, [pickerOpen, load])

  const detail = useMemo(() => {
    if (!selectedCustomer) return null
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
        <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedCustomer.name}</span></div>
        <div><span className="text-muted-foreground">Phone:</span> {selectedCustomer.phone ?? '—'}</div>
        <div><span className="text-muted-foreground">Email:</span> {selectedCustomer.email ?? '—'}</div>
        <div><span className="text-muted-foreground">Address:</span> {selectedCustomer.address ?? '—'}</div>
      </div>
    )
  }, [selectedCustomer])

  return (
    <div className="space-y-4">
      {!selectedCustomer ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">No customer selected for this job.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Select customer
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
            >
              Add new customer
            </button>
          </div>
        </div>
      ) : (
        <>
          {detail}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPickerOpen(true)} className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
              Change customer
            </button>
            <button type="button" onClick={() => setAddOpen(true)} className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
              Add another customer
            </button>
            {canEditCustomer && (
              <button
                type="button"
                onClick={() => setCustomerToEdit(selectedCustomer)}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
              >
                Edit customer details
              </button>
            )}
          </div>
          {canEditCustomer && (
            <p className="text-xs text-muted-foreground">
              Update name, phone, email, and address for this customer. Job links stay the same.
            </p>
          )}
        </>
      )}

      <Modal
        open={pickerOpen}
        title="Select customer"
        onClose={() => setPickerOpen(false)}
        size="lg"
      >
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background mb-3"
          aria-label="Search customers"
        />
        <div className="max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No matches.</p>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectCustomer(c)
                  setPickerOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-muted-foreground ms-2 tabular-nums">{c.phone}</span>}
              </button>
            ))
          )}
        </div>
      </Modal>

      <AddCustomerModal
        open={addOpen || customerToEdit != null}
        customerToEdit={customerToEdit}
        onClose={() => {
          setAddOpen(false)
          setCustomerToEdit(null)
        }}
        onSaved={c => {
          if (customerToEdit) {
            onCustomerUpdated?.(c)
            setCustomerToEdit(null)
          } else {
            onSelectCustomer(c)
            setAddOpen(false)
          }
        }}
      />
    </div>
  )
}
