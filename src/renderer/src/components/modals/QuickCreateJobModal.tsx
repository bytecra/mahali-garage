import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import Modal from '../shared/Modal'
import AddCustomerModal from './sub-modals/AddCustomerModal'
import AddCarModal from './sub-modals/AddCarModal'
import { toast } from '../../store/notificationStore'
import type { VehicleOption } from './job-tabs/vehicleOption'

interface CustomerLite {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

interface JobTypeOption { id: number; name: string }

type Dept = 'mechanical' | 'programming' | 'both'

export default function QuickCreateJobModal(props: {
  open: boolean
  onClose: () => void
  onBack: () => void
  /** After successful create */
  onCreated: (jobId: number) => void
}): JSX.Element | null {
  const { open, onClose, onBack, onCreated } = props
  const [saving, setSaving] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const dSearch = useDebounce(customerSearch, 300)
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(null)
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null)
  const [jobTypes, setJobTypes] = useState<JobTypeOption[]>([])
  const [jobType, setJobType] = useState('General Service')
  const [department, setDepartment] = useState<Dept>('mechanical')
  const [addCustOpen, setAddCustOpen] = useState(false)
  const [addCarOpen, setAddCarOpen] = useState(false)

  const loadCustomers = useCallback(async () => {
    setCustomerLoading(true)
    try {
      const res = await window.electronAPI.customers.list({ search: dSearch, pageSize: 100 })
      if (res.success && res.data) {
        const d = res.data as { items: CustomerLite[] }
        setCustomerResults(d.items ?? [])
      } else setCustomerResults([])
    } finally {
      setCustomerLoading(false)
    }
  }, [dSearch])

  useEffect(() => {
    if (!open) return
    void loadCustomers()
  }, [open, loadCustomers])

  useEffect(() => {
    if (!open) return
    setCustomerSearch('')
    setSelectedCustomer(null)
    setSelectedVehicle(null)
    setJobType('General Service')
    setDepartment('mechanical')
    void window.electronAPI.jobTypes.listActive().then(res => {
      if (res.success && res.data) setJobTypes(res.data as JobTypeOption[])
    })
    void window.electronAPI.vehicles.list({ pageSize: 800 }).then(res => {
      if (res.success && res.data) {
        const d = res.data as { items: VehicleOption[] }
        setVehicles(d.items ?? [])
      }
    })
  }, [open])

  const vehiclesForCustomer = useMemo(
    () => (selectedCustomer ? vehicles.filter(v => v.owner_id === selectedCustomer.id) : []),
    [vehicles, selectedCustomer],
  )

  useEffect(() => {
    if (!selectedVehicle || !selectedCustomer) return
    if (selectedVehicle.owner_id !== selectedCustomer.id) setSelectedVehicle(null)
  }, [selectedCustomer, selectedVehicle])

  const canSave = !!selectedCustomer && !!selectedVehicle

  const handleSave = async (): Promise<void> => {
    if (!selectedCustomer || !selectedVehicle) {
      toast.error('Select a customer and a vehicle')
      return
    }
    if (selectedVehicle.owner_id !== selectedCustomer.id) {
      toast.error('Vehicle does not belong to this customer')
      return
    }
    setSaving(true)
    try {
      const res = await window.electronAPI.jobCards.create({
        vehicle_id: selectedVehicle.id,
        owner_id: selectedCustomer.id,
        job_type: jobType || 'General Service',
        department,
        status: 'pending',
        profile_complete: 0,
        complaint: null,
        diagnosis: null,
        priority: 'normal',
        labor_rate: 85,
        deposit: 0,
        tax_rate: 0,
        notes: null,
        customer_authorized: 0,
      })
      setSaving(false)
      if (!res.success || !res.data) {
        toast.error((res as { error?: string }).error ?? 'Could not create job')
        return
      }
      const { id } = res.data as { id: number }
      toast.success('Job created — add details when you are ready.')
      onCreated(id)
      onClose()
    } catch {
      setSaving(false)
      toast.error('Could not create job')
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="Quick create job"
        onClose={onClose}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
            >
              ← Back
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void handleSave()}
              className="px-4 py-2 text-sm rounded-md bg-[#0066CC] text-white font-semibold hover:bg-[#0066CC]/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-sm font-medium mb-1">Customer *</label>
            {!selectedCustomer ? (
              <>
                <input
                  type="search"
                  placeholder="Search by name or phone number…"
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background mb-2"
                />
                <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {customerLoading && <p className="p-2 text-xs text-muted-foreground">Searching…</p>}
                  {!customerLoading &&
                    customerResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedCustomer(c)
                          setSelectedVehicle(null)
                        }}
                      >
                        {c.name}
                        {c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
                      </button>
                    ))}
                  {!customerLoading && customerResults.length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">No matches</p>
                  )}
                </div>
                <button type="button" onClick={() => setAddCustOpen(true)} className="mt-2 text-sm text-primary hover:underline">
                  + Add new customer
                </button>
              </>
            ) : (
              <div className="rounded-lg border border-border p-3 flex justify-between items-start gap-2">
                <div>
                  <p className="font-medium">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone ?? '—'}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setSelectedVehicle(null)
                  }}
                >
                  Change
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Vehicle *</label>
            {!selectedCustomer ? (
              <p className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">Select a customer first</p>
            ) : (
              <>
                <select
                  value={selectedVehicle?.id ?? ''}
                  onChange={e => {
                    const id = e.target.value
                    if (!id) {
                      setSelectedVehicle(null)
                      return
                    }
                    const v = vehiclesForCustomer.find(x => x.id === Number(id))
                    if (v) setSelectedVehicle(v)
                  }}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">— Select vehicle —</option>
                  {vehiclesForCustomer.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} {v.year ?? ''} {v.license_plate ? `· ${v.license_plate}` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setAddCarOpen(true)} className="mt-2 text-sm text-primary hover:underline">
                  + Add new vehicle
                </button>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Job type (optional)</label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            >
              {jobTypes.length === 0 ? (
                <option value="General Service">General Service</option>
              ) : (
                jobTypes.map(jt => (
                  <option key={jt.id} value={jt.name}>
                    {jt.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium mb-2">Department (required)</span>
            <p className="text-xs text-muted-foreground mb-2">
              Use <strong className="text-foreground">Both</strong> when the same vehicle needs mechanical and programming on this job card. Single-dept jobs stay easier to route and report.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['mechanical', 'Mechanical'],
                  ['programming', 'Programming'],
                  ['both', 'Both'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDepartment(val)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    department === val
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <AddCustomerModal
        open={addCustOpen}
        customerToEdit={null}
        onClose={() => setAddCustOpen(false)}
        onSaved={c => {
          setAddCustOpen(false)
          setSelectedCustomer(c)
          setSelectedVehicle(null)
          void loadCustomers()
        }}
      />
      <AddCarModal
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        ownerId={selectedCustomer?.id ?? null}
        vehicleToEdit={null}
        onSaved={v => {
          setAddCarOpen(false)
          const full: VehicleOption = {
            ...v,
            owner_name: v.owner_name ?? selectedCustomer?.name ?? null,
          }
          setVehicles(prev => (prev.some(x => x.id === full.id) ? prev : [...prev, full]))
          setSelectedVehicle(full)
        }}
      />
    </>
  )
}
