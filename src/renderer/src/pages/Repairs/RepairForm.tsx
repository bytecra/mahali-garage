import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'
import { cn, formatCurrency } from '../../lib/utils'

interface Props {
  open: boolean
  repairId?: number
  onClose: () => void
  onSaved: () => void
}

interface Technician { id: number; full_name: string; role: string }
interface VehicleOption {
  id: number; make: string; model: string; year: number | null
  license_plate: string | null; vin: string | null; mileage: number
  owner_id: number | null; owner_name: string | null
}
interface Part { name: string; qty: number; cost: number }
interface JobTypeOption { id: number; name: string }

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
const STATUSES = ['pending', 'in_progress', 'waiting_parts', 'ready', 'delivered', 'cancelled'] as const
const DEPARTMENTS = [
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'programming', label: 'Programming' },
  { value: 'both', label: 'Both' },
] as const
const BAYS = ['', 'Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6']

const EMPTY_PART: Part = { name: '', qty: 1, cost: 0 }

export default function RepairForm({ open, repairId, onClose, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const isEdit = !!repairId
  const [saving, setSaving] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [jobTypes, setJobTypes] = useState<JobTypeOption[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null)

  const [form, setForm] = useState({
    job_type:              'General Service',
    department:            'mechanical' as typeof DEPARTMENTS[number]['value'],
    priority:              'normal' as typeof PRIORITIES[number],
    status:                'pending' as typeof STATUSES[number],
    vehicle_id:            '',
    owner_id:              '',
    technician_id:         '',
    bay_number:            '',
    mileage_in:            '',
    expected_completion:   '',
    complaint:             '',
    diagnosis:             '',
    work_done:             '',
    labor_hours:           '0',
    labor_rate:            '85',
    deposit:               '0',
    tax_rate:              '0',
    notes:                 '',
    customer_authorized:   false,
  })

  const set = (key: keyof typeof form, val: string | boolean) => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => {
    if (!open) return
    setParts([])
    setSelectedVehicle(null)

    Promise.all([
      window.electronAPI.users?.list({}),
      window.electronAPI.vehicles.list({ pageSize: 500 }),
      window.electronAPI.jobTypes.listActive(),
    ]).then(([techRes, vehRes, jtRes]) => {
      if (techRes?.success) setTechnicians((techRes.data as { rows: Technician[] }).rows ?? [])
      if (vehRes?.success) setVehicles((vehRes.data as { items: VehicleOption[] }).items ?? [])
      if (jtRes?.success) setJobTypes(jtRes.data as JobTypeOption[])
    })

    if (isEdit) {
      window.electronAPI.jobCards.getById(repairId).then(res => {
        if (res.success && res.data) {
          const r = res.data as Record<string, unknown>
          setForm({
            job_type:            (r.job_type as string) ?? 'General Service',
            department:          (['mechanical', 'programming', 'both'].includes(r.department as string)
              ? r.department
              : 'mechanical') as typeof DEPARTMENTS[number]['value'],
            priority:            (r.priority as typeof PRIORITIES[number]) ?? 'normal',
            status:              (r.status as typeof STATUSES[number]) ?? 'pending',
            vehicle_id:          r.vehicle_id ? String(r.vehicle_id) : '',
            owner_id:            r.owner_id ? String(r.owner_id) : '',
            technician_id:       r.technician_id ? String(r.technician_id) : '',
            bay_number:          (r.bay_number as string) ?? '',
            mileage_in:          r.mileage_in ? String(r.mileage_in) : '',
            expected_completion: (r.expected_completion as string) ?? '',
            complaint:           (r.complaint as string) ?? '',
            diagnosis:           (r.diagnosis as string) ?? '',
            work_done:           (r.work_done as string) ?? '',
            labor_hours:         String(r.labor_hours ?? 0),
            labor_rate:          String(r.labor_rate ?? 85),
            deposit:             String(r.deposit ?? 0),
            tax_rate:            String(r.tax_rate ?? 0),
            notes:               (r.notes as string) ?? '',
            customer_authorized: !!(r.customer_authorized),
          })
          if (r.vehicle_id) {
            setSelectedVehicle({
              id: r.vehicle_id as number,
              make: r.vehicle_make as string,
              model: r.vehicle_model as string,
              year: r.vehicle_year as number | null,
              license_plate: r.vehicle_plate as string | null,
              vin: r.vehicle_vin as string | null,
              mileage: r.vehicle_mileage as number ?? 0,
              owner_id: r.owner_id as number | null,
              owner_name: r.owner_name as string | null,
            })
          }
          const existingParts = r.parts as Array<{ description: string; quantity: number; unit_price: number }> | undefined
          if (existingParts?.length) {
            setParts(existingParts.map(p => ({ name: p.description ?? '', qty: p.quantity, cost: p.unit_price })))
          }
        }
      })
    } else {
      setForm({
        job_type: 'General Service', department: 'mechanical', priority: 'normal', status: 'pending',
        vehicle_id: '', owner_id: '', technician_id: '', bay_number: '',
        mileage_in: '', expected_completion: '', complaint: '', diagnosis: '',
        work_done: '', labor_hours: '0', labor_rate: '85', deposit: '0',
        tax_rate: '0', notes: '', customer_authorized: false,
      })
    }
  }, [open, repairId, isEdit])

  const handleVehicleChange = (vehicleIdStr: string) => {
    set('vehicle_id', vehicleIdStr)
    if (!vehicleIdStr) { setSelectedVehicle(null); set('owner_id', ''); set('mileage_in', ''); return }
    const v = vehicles.find(veh => veh.id === Number(vehicleIdStr))
    if (v) {
      setSelectedVehicle(v)
      if (v.owner_id) set('owner_id', String(v.owner_id))
      if (v.mileage) set('mileage_in', String(v.mileage))
    }
  }

  const addPart = () => setParts(p => [...p, { ...EMPTY_PART }])
  const removePart = (i: number) => setParts(p => p.filter((_, idx) => idx !== i))
  const setPart = (i: number, key: keyof Part, val: string) =>
    setParts(p => p.map((pt, idx) => idx !== i ? pt : { ...pt, [key]: key === 'name' ? val : Number(val) || 0 }))

  const laborHours = Number(form.labor_hours) || 0
  const laborRate = Number(form.labor_rate) || 0
  const laborTotal = laborHours * laborRate
  const partsTotal = parts.reduce((s, p) => s + p.qty * p.cost, 0)
  const subtotal = laborTotal + partsTotal
  const taxRate = Number(form.tax_rate) || 0
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount
  const deposit = Number(form.deposit) || 0
  const balanceDue = total - deposit

  const handleSave = async () => {
    if (!form.vehicle_id) { toast.error('Please select a vehicle'); return }
    setSaving(true)

    const payload = {
      vehicle_id: Number(form.vehicle_id) || null,
      owner_id: Number(form.owner_id) || null,
      job_type: form.job_type,
      department: form.department,
      priority: form.priority,
      technician_id: Number(form.technician_id) || null,
      bay_number: form.bay_number || null,
      mileage_in: Number(form.mileage_in) || null,
      expected_completion: form.expected_completion || null,
      complaint: form.complaint || null,
      diagnosis: form.diagnosis || null,
      work_done: form.work_done || null,
      labor_hours: laborHours,
      labor_rate: laborRate,
      deposit,
      tax_rate: taxRate,
      notes: form.notes || null,
      customer_authorized: form.customer_authorized ? 1 : 0,
    }

    if (isEdit) {
      const res = await window.electronAPI.jobCards.update(repairId, { ...payload, status: form.status })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    } else {
      const res = await window.electronAPI.jobCards.create({ ...payload, status: form.status })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
      const result = res.data as { id: number; job_number: string }
      if (parts.length > 0) {
        for (const p of parts) {
          if (!p.name && !p.cost) continue
          await window.electronAPI.jobCards.addPart(result.id, {
            description: p.name, quantity: p.qty, unit_price: p.cost,
          })
        }
      }
    }

    if (isEdit && parts.length > 0) {
      const existing = await window.electronAPI.jobCards.getById(repairId)
      if (existing.success) {
        const existingParts = (existing.data as { parts: { id: number }[] }).parts
        for (const ep of existingParts) {
          await window.electronAPI.jobCards.removePart(ep.id)
        }
      }
      for (const p of parts) {
        if (!p.name && !p.cost) continue
        await window.electronAPI.jobCards.addPart(repairId, {
          description: p.name, quantity: p.qty, unit_price: p.cost,
        })
      }
    }

    toast.success(t('common.success'))
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'
  const sectionCls = 'border-t border-border pt-4 mt-4'

  return (
    <Modal open={open} title={isEdit ? 'Edit Job Card' : 'New Job Card'} onClose={onClose} size="xl"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </>}
    >
      <div className="space-y-0">
        {/* ── Section 1: Job Info ── */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Job Type</label>
            <select value={form.job_type} onChange={e => set('job_type', e.target.value)} className={inputCls}>
              {jobTypes.length > 0
                ? jobTypes.map(jt => <option key={jt.id} value={jt.name}>{jt.name}</option>)
                : <option value={form.job_type}>{form.job_type}</option>
              }
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
              {PRIORITIES.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
              {STATUSES.map(v => <option key={v} value={v}>{v.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>Department</label>
          <div className="flex rounded-lg border border-input p-0.5 bg-muted/40 gap-0.5">
            {DEPARTMENTS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => set('department', d.value)}
                className={cn(
                  'flex-1 px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  form.department === d.value
                    ? 'bg-background text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 2: Vehicle & Owner ── */}
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Vehicle & Owner</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Vehicle *</label>
              <select value={form.vehicle_id} onChange={e => handleVehicleChange(e.target.value)} className={inputCls}>
                <option value="">— Select Vehicle —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} {v.year ?? ''} {v.license_plate ? `(${v.license_plate})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Owner</label>
              <input readOnly value={selectedVehicle?.owner_name ?? '—'} className={`${inputCls} bg-muted/50 cursor-default`} />
            </div>
          </div>
          {selectedVehicle && (
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-0.5">VIN</label>
                <span className="text-sm font-mono">{selectedVehicle.vin ?? '—'}</span>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-0.5">Plate</label>
                <span className="text-sm">{selectedVehicle.license_plate ?? '—'}</span>
              </div>
              <div>
                <label className={labelCls}>Mileage In (km)</label>
                <input type="number" value={form.mileage_in} onChange={e => set('mileage_in', e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* ── Section 3: Service Details ── */}
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Service Details</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Expected Completion</label>
              <input type="date" value={form.expected_completion} onChange={e => set('expected_completion', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Technician</label>
              <select value={form.technician_id} onChange={e => set('technician_id', e.target.value)} className={inputCls}>
                <option value="">— Unassigned —</option>
                {technicians.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bay</label>
              <select value={form.bay_number} onChange={e => set('bay_number', e.target.value)} className={inputCls}>
                {BAYS.map(b => <option key={b} value={b}>{b || 'Unassigned'}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Section 4: Work Description ── */}
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Work Description</h3>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Customer Complaint</label>
              <textarea value={form.complaint} onChange={e => set('complaint', e.target.value)} rows={2} className={inputCls}
                placeholder="e.g., Engine making strange noise, check engine light on" />
            </div>
            <div>
              <label className={labelCls}>Diagnosis</label>
              <textarea value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} rows={2} className={inputCls}
                placeholder="e.g., Faulty oxygen sensor causing misfire" />
            </div>
            {isEdit && (
              <div>
                <label className={labelCls}>Work Done</label>
                <textarea value={form.work_done} onChange={e => set('work_done', e.target.value)} rows={2} className={inputCls}
                  placeholder="e.g., Replaced oxygen sensor, cleared fault codes, test drove" />
              </div>
            )}
          </div>
        </div>

        {/* ── Section 5: Parts ── */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">
              Parts Used
              {parts.length > 0 && <span className="ms-2 text-xs font-normal text-muted-foreground">({parts.length})</span>}
            </h3>
            <button type="button" onClick={addPart}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20">
              <Plus className="w-3.5 h-3.5" />Add Part
            </button>
          </div>
          {parts.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg py-4 text-center text-sm text-muted-foreground">
              No parts added yet
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_100px_80px_36px] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Part Name</span>
                <span className="text-center">Qty</span>
                <span className="text-center">Unit Cost</span>
                <span className="text-end">Total</span>
                <span />
              </div>
              <div className="divide-y divide-border">
                {parts.map((part, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_36px] gap-0 items-center px-3 py-2">
                    <input value={part.name} onChange={e => setPart(i, 'name', e.target.value)} placeholder="e.g. Oil Filter"
                      className="px-2 py-1 text-sm border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring me-2" />
                    <input type="number" min="1" value={part.qty} onChange={e => setPart(i, 'qty', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-input rounded bg-background text-center mx-1" />
                    <input type="number" min="0" step="0.01" value={part.cost} onChange={e => setPart(i, 'cost', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-input rounded bg-background text-center mx-1" />
                    <span className="text-sm font-medium text-end pe-1">{formatCurrency(part.qty * part.cost)}</span>
                    <button type="button" onClick={() => removePart(i)}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive ms-auto">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3 px-3 py-2 bg-muted/30 border-t border-border">
                <span className="text-xs text-muted-foreground">Parts Total</span>
                <span className="text-sm font-bold text-primary">{formatCurrency(partsTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 6: Labor & Pricing ── */}
        <div className={sectionCls}>
          <h3 className="text-sm font-semibold text-foreground mb-3">Labor & Pricing</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Labor Hours</label>
              <input type="number" min="0" step="0.5" value={form.labor_hours} onChange={e => set('labor_hours', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Labor Rate (per hour)</label>
              <input type="number" min="0" step="0.01" value={form.labor_rate} onChange={e => set('labor_rate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Labor Total</label>
              <input readOnly value={formatCurrency(laborTotal)} className={`${inputCls} bg-muted/50 font-medium`} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div>
              <label className={labelCls}>Tax Rate (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Deposit Paid</label>
              <input type="number" min="0" step="0.01" value={form.deposit} onChange={e => set('deposit', e.target.value)} className={inputCls} />
            </div>
            <div />
          </div>
          <div className="mt-4 bg-muted/30 border border-border rounded-lg p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Parts Total</span><span>{formatCurrency(partsTotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Labor Total</span><span>{formatCurrency(laborTotal)}</span></div>
            <div className="flex justify-between text-sm border-t border-border pt-1.5"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {taxRate > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
            {deposit > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Deposit</span><span>-{formatCurrency(deposit)}</span></div>}
            <div className="flex justify-between text-sm font-bold"><span>Balance Due</span><span className={balanceDue > 0 ? 'text-destructive' : 'text-green-600'}>{formatCurrency(balanceDue)}</span></div>
          </div>
        </div>

        {/* ── Section 7: Additional ── */}
        <div className={sectionCls}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Internal Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={inputCls}
                placeholder="e.g., Customer prefers OEM parts only" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.customer_authorized} onChange={e => set('customer_authorized', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Customer authorized work exceeding estimate</span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}
