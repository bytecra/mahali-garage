import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'
import { formatCurrency } from '../../lib/utils'

interface Props {
  open: boolean
  repairId?: number
  onClose: () => void
  onSaved: () => void
}

interface Technician { id: number; full_name: string; role: string }
interface Customer   { id: number; name: string }
interface Part       { name: string; qty: number; cost: number }

const TYPES      = ['repair', 'pc_build', 'installation', 'other'] as const
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
const STATUSES   = ['received', 'diagnosed', 'waiting_parts', 'in_progress', 'completed', 'delivered', 'cancelled'] as const

const EMPTY_PART: Part = { name: '', qty: 1, cost: 0 }

export default function RepairForm({ open, repairId, onClose, onSaved }: Props): JSX.Element {
  const { t } = useTranslation()
  const isEdit = !!repairId
  const [saving, setSaving] = useState(false)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [customers, setCustomers]     = useState<Customer[]>([])
  const [statusChangeNote, setStatusChangeNote] = useState('')
  const [originalStatus, setOriginalStatus]     = useState('')
  const [parts, setParts] = useState<Part[]>([])

  const [errors, setErrors] = useState<{ customer?: string; issue?: string }>({})

  const [form, setForm] = useState({
    type:           'repair' as typeof TYPES[number],
    priority:       'normal' as typeof PRIORITIES[number],
    status:         'received' as typeof STATUSES[number],
    customer_id:    '',
    technician_id:  '',
    device_type:    '',
    device_brand:   '',
    device_model:   '',
    serial_number:  '',
    reported_issue: '',
    diagnosis:      '',
    work_done:      '',
    estimated_cost: '',
    final_cost:     '',
    deposit_paid:   '',
    estimated_date: '',
    notes:          '',
  })

  const set = (key: keyof typeof form, val: string) => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => {
    if (!open) return
    setParts([])
    setStatusChangeNote('')
    setErrors({})

    Promise.all([
      window.electronAPI.users?.list({}),
      window.electronAPI.customers.list(),
    ]).then(([techRes, custRes]) => {
      if (techRes?.success) setTechnicians((techRes.data as { rows: Technician[] }).rows ?? [])
      if (custRes?.success) setCustomers((custRes.data as { rows: Customer[] }).rows ?? [])
    })

    if (isEdit) {
      window.electronAPI.repairs.getById(repairId).then(res => {
        if (res.success && res.data) {
          const r = res.data as Record<string, unknown>
          setOriginalStatus(r.status as string)
          setForm({
            type:           (r.type as typeof TYPES[number])         ?? 'repair',
            priority:       (r.priority as typeof PRIORITIES[number]) ?? 'normal',
            status:         (r.status as typeof STATUSES[number])     ?? 'received',
            customer_id:    r.customer_id    ? String(r.customer_id)    : '',
            technician_id:  r.technician_id  ? String(r.technician_id)  : '',
            device_type:    (r.device_type   as string) ?? '',
            device_brand:   (r.device_brand  as string) ?? '',
            device_model:   (r.device_model  as string) ?? '',
            serial_number:  (r.serial_number as string) ?? '',
            reported_issue: (r.reported_issue as string) ?? '',
            diagnosis:      (r.diagnosis  as string) ?? '',
            work_done:      (r.work_done  as string) ?? '',
            estimated_cost: r.estimated_cost ? String(r.estimated_cost) : '',
            final_cost:     r.final_cost     ? String(r.final_cost)     : '',
            deposit_paid:   r.deposit_paid   ? String(r.deposit_paid)   : '',
            estimated_date: (r.estimated_date as string) ?? '',
            notes:          (r.notes          as string) ?? '',
          })
          // Parse parts_used JSON
          try {
            const raw = r.parts_used as string | null
            if (raw) setParts(JSON.parse(raw) as Part[])
          } catch { /* ignore */ }
        }
      })
    } else {
      setForm({
        type: 'repair', priority: 'normal', status: 'received',
        customer_id: '', technician_id: '', device_type: '',
        device_brand: '', device_model: '', serial_number: '',
        reported_issue: '', diagnosis: '', work_done: '',
        estimated_cost: '', final_cost: '', deposit_paid: '',
        estimated_date: '', notes: '',
      })
    }
  }, [open, repairId, isEdit])

  // Parts helpers
  const addPart    = () => setParts(p => [...p, { ...EMPTY_PART }])
  const removePart = (i: number) => setParts(p => p.filter((_, idx) => idx !== i))
  const setPart    = (i: number, key: keyof Part, val: string) =>
    setParts(p => p.map((pt, idx) => idx !== i ? pt : { ...pt, [key]: key === 'name' ? val : Number(val) || 0 }))

  const partsTotal = parts.reduce((s, p) => s + p.qty * p.cost, 0)

  const handleSave = async () => {
    const newErrors: { customer?: string; issue?: string } = {}
    if (!form.customer_id) newErrors.customer = t('repairs.customerRequired')
    if (!form.reported_issue.trim()) newErrors.issue = t('repairs.issueRequired')
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    setErrors({})
    setSaving(true)

    const partsJson = parts.length > 0 ? JSON.stringify(parts) : null

    if (isEdit) {
      if (form.status !== originalStatus) {
        const res = await window.electronAPI.repairs.updateStatus(repairId, form.status, statusChangeNote || undefined)
        if (!res.success) { toast.error(res.error ?? t('common.error')); setSaving(false); return }
      }
      const res = await window.electronAPI.repairs.update(repairId, {
        type: form.type, priority: form.priority,
        customer_id:   form.customer_id   ? Number(form.customer_id)   : null,
        technician_id: form.technician_id ? Number(form.technician_id) : null,
        device_type:   form.device_type   || null,
        device_brand:  form.device_brand  || null,
        device_model:  form.device_model  || null,
        serial_number: form.serial_number || null,
        reported_issue: form.reported_issue,
        diagnosis:   form.diagnosis  || null,
        work_done:   form.work_done  || null,
        parts_used:  partsJson,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : 0,
        final_cost:     form.final_cost     ? Number(form.final_cost)     : 0,
        deposit_paid:   form.deposit_paid   ? Number(form.deposit_paid)   : 0,
        estimated_date: form.estimated_date || null,
        notes:          form.notes          || null,
      })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    } else {
      const res = await window.electronAPI.repairs.create({
        type: form.type, priority: form.priority,
        customer_id:   form.customer_id   ? Number(form.customer_id)   : null,
        technician_id: form.technician_id ? Number(form.technician_id) : null,
        device_type:   form.device_type   || undefined,
        device_brand:  form.device_brand  || undefined,
        device_model:  form.device_model  || undefined,
        serial_number: form.serial_number || undefined,
        reported_issue: form.reported_issue,
        diagnosis:    form.diagnosis    || undefined,
        parts_used:   partsJson,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : 0,
        deposit_paid:   form.deposit_paid   ? Number(form.deposit_paid)   : 0,
        estimated_date: form.estimated_date || undefined,
        notes:          form.notes          || undefined,
      })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    }
    toast.success(t('common.success'))
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  return (
    <Modal open={open} title={isEdit ? t('repairs.editJob') : t('repairs.addJob')} onClose={onClose} size="xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Type */}
        <div>
          <label className={labelCls}>{t('repairs.type')}</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls}>
            {TYPES.map(v => <option key={v} value={v}>{t(`repairs.${v === 'pc_build' ? 'pcBuild' : v}`)}</option>)}
          </select>
        </div>
        {/* Priority */}
        <div>
          <label className={labelCls}>{t('repairs.priority')}</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
            {PRIORITIES.map(v => <option key={v} value={v}>{t(`repairs.${v}`)}</option>)}
          </select>
        </div>
        {/* Status (edit only) */}
        {isEdit && (
          <div>
            <label className={labelCls}>{t('common.status')}</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
              {STATUSES.map(v => <option key={v} value={v}>{t(`repairs.status.${v}`)}</option>)}
            </select>
          </div>
        )}
        {/* Customer */}
        <div>
          <label className={labelCls}>{t('customers.title')} *</label>
          <select
            value={form.customer_id}
            onChange={e => { set('customer_id', e.target.value); setErrors(er => ({ ...er, customer: undefined })) }}
            className={inputCls + (errors.customer ? ' border-destructive ring-1 ring-destructive' : '')}
          >
            <option value="">— {t('repairs.selectCustomer')} —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.customer && <p className="text-destructive text-xs mt-1">{errors.customer}</p>}
        </div>
        {/* Assigned To */}
        <div>
          <label className={labelCls}>{t('repairs.assignedTo')}</label>
          <select value={form.technician_id} onChange={e => set('technician_id', e.target.value)} className={inputCls}>
            <option value="">— {t('repairs.unassigned')} —</option>
            {technicians.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        {/* Device brand */}
        <div>
          <label className={labelCls}>{t('repairs.deviceBrand')}</label>
          <input value={form.device_brand} onChange={e => set('device_brand', e.target.value)} className={inputCls} />
        </div>
        {/* Device model */}
        <div>
          <label className={labelCls}>{t('repairs.deviceModel')}</label>
          <input value={form.device_model} onChange={e => set('device_model', e.target.value)} className={inputCls} />
        </div>
        {/* Serial */}
        <div>
          <label className={labelCls}>{t('repairs.serialNumber')}</label>
          <input value={form.serial_number} onChange={e => set('serial_number', e.target.value)} className={inputCls} />
        </div>
        {/* Reported issue */}
        <div className="col-span-2">
          <label className={labelCls}>{t('repairs.reportedIssue')} *</label>
          <textarea
            value={form.reported_issue}
            onChange={e => { set('reported_issue', e.target.value); setErrors(er => ({ ...er, issue: undefined })) }}
            rows={2}
            className={inputCls + (errors.issue ? ' border-destructive ring-1 ring-destructive' : '')}
          />
          {errors.issue && <p className="text-destructive text-xs mt-1">{errors.issue}</p>}
        </div>
        {/* Diagnosis */}
        <div className="col-span-2">
          <label className={labelCls}>{t('repairs.diagnosis')}</label>
          <textarea value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} rows={2} className={inputCls} />
        </div>
        {/* Work done (edit) */}
        {isEdit && (
          <div className="col-span-2">
            <label className={labelCls}>{t('repairs.workDone')}</label>
            <textarea value={form.work_done} onChange={e => set('work_done', e.target.value)} rows={2} className={inputCls} />
          </div>
        )}

        {/* ── Parts / Components ────────────────────────────────────────── */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-foreground">
              {t('repairs.partsComponents')}
              {parts.length > 0 && (
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  ({parts.length} {parts.length === 1 ? 'item' : 'items'})
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={addPart}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('repairs.addPart')}
            </button>
          </div>

          {parts.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg py-5 text-center text-sm text-muted-foreground">
              {t('repairs.noPartsYet')}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_80px_100px_80px_36px] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t('repairs.partName')}</span>
                <span className="text-center">{t('common.quantity')}</span>
                <span className="text-center">{t('repairs.unitCost')}</span>
                <span className="text-end">{t('common.total')}</span>
                <span />
              </div>

              {/* Part rows */}
              <div className="divide-y divide-border">
                {parts.map((part, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_80px_36px] gap-0 items-center px-3 py-2">
                    <input
                      value={part.name}
                      onChange={e => setPart(i, 'name', e.target.value)}
                      placeholder={t('repairs.partNamePlaceholder')}
                      className="px-2 py-1 text-sm border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring me-2"
                    />
                    <input
                      type="number" min="1" value={part.qty}
                      onChange={e => setPart(i, 'qty', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring text-center mx-1"
                    />
                    <input
                      type="number" min="0" step="0.01" value={part.cost}
                      onChange={e => setPart(i, 'cost', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring text-center mx-1"
                    />
                    <span className="text-sm font-medium text-end pe-1">
                      {formatCurrency(part.qty * part.cost)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePart(i)}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ms-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Parts total */}
              <div className="flex items-center justify-end gap-3 px-3 py-2 bg-muted/30 border-t border-border">
                <span className="text-xs text-muted-foreground">{t('repairs.partsTotal')}</span>
                <span className="text-sm font-bold text-primary">{formatCurrency(partsTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Est cost */}
        <div>
          <label className={labelCls}>{t('repairs.estimatedCost')}</label>
          <input type="number" min="0" step="0.01" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} className={inputCls} />
        </div>
        {/* Final cost (edit) */}
        {isEdit && (
          <div>
            <label className={labelCls}>{t('repairs.finalCost')}</label>
            <input type="number" min="0" step="0.01" value={form.final_cost} onChange={e => set('final_cost', e.target.value)} className={inputCls} />
          </div>
        )}
        {/* Deposit */}
        <div>
          <label className={labelCls}>{t('repairs.deposit')}</label>
          <input type="number" min="0" step="0.01" value={form.deposit_paid} onChange={e => set('deposit_paid', e.target.value)} className={inputCls} />
        </div>
        {/* Estimated date */}
        <div>
          <label className={labelCls}>{t('repairs.estimatedDate')}</label>
          <input type="date" value={form.estimated_date} onChange={e => set('estimated_date', e.target.value)} className={inputCls} />
        </div>
        {/* Notes */}
        <div className="col-span-2">
          <label className={labelCls}>{t('common.notes')}</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} className={inputCls} />
        </div>
        {/* Status change note */}
        {isEdit && form.status !== originalStatus && (
          <div className="col-span-2">
            <label className={labelCls}>Status Change Note</label>
            <input value={statusChangeNote} onChange={e => setStatusChangeNote(e.target.value)} placeholder="Optional note for status change" className={inputCls} />
          </div>
        )}
      </div>
    </Modal>
  )
}
