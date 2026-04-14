import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Printer, Trash2 } from 'lucide-react'
import Modal from '../shared/Modal'
import InvoiceCreatedModal, { type InvoiceCreatedPayload } from './InvoiceCreatedModal'
import { formatCurrency } from '../../lib/utils'
import CurrencyText from '../shared/CurrencyText'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'
import InvoiceWarrantyEditor, {
  rowsFromServer,
  warrantyDraftsToPayload,
  type InvoiceWarrantyDraft,
  type WarrantyTemplateLite,
} from './invoice/InvoiceWarrantyEditor'

type JobPartRow = {
  id: number
  description: string | null
  quantity: number
  unit_price: number
  total: number
  service_catalog_id?: number | null
  default_unit_price?: number | null
}

type JobRecord = {
  id: number
  job_number: string
  owner_id: number | null
  vehicle_id: number | null
  tax_rate: number | null
  owner_name?: string | null
  vehicle_make?: string | null
  vehicle_model?: string | null
  vehicle_year?: number | null
  vehicle_plate?: string | null
  vehicle_vin?: string | null
  status: string
  created_at: string
  parts?: JobPartRow[]
  invoice_discount_type?: string | null
  invoice_discount_value?: number | null
  invoice_payment_terms?: string | null
}

type DraftLine = {
  lineKey: string
  job_part_id: number | null
  description: string
  quantity: number
  unit_price: number
  service_catalog_id: number | null
  default_unit_price: number | null
}

type ExistingInvoiceBrief = { invoice_number: string; locked: boolean }

function newLineKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function computeDiscount(
  subtotal: number,
  discountType: 'percentage' | 'fixed' | null,
  discountValue: number,
): number {
  if (subtotal <= 0 || discountValue <= 0) return 0
  if (discountType === 'fixed') return Math.min(discountValue, subtotal)
  if (discountType === 'percentage') return Math.min(subtotal * (discountValue / 100), subtotal)
  return 0
}

export default function JobInvoiceWizardModal(props: {
  open: boolean
  jobId: number | null
  onClose: () => void
  onCreated?: () => void
}): JSX.Element | null {
  const { open, jobId, onClose, onCreated } = props
  const navigate = useNavigate()
  const canEditInvoice = usePermission('invoices.edit')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [job, setJob] = useState<JobRecord | null>(null)
  const [storeName, setStoreName] = useState('Mahali Garage')
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoiceBrief | null>(null)
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [taxRate, setTaxRate] = useState(0)
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | null>(null)
  const [discountValue, setDiscountValue] = useState(0)
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [createdPayload, setCreatedPayload] = useState<InvoiceCreatedPayload | null>(null)
  const [addPartPick, setAddPartPick] = useState<string>('')
  const [warrantyTemplates, setWarrantyTemplates] = useState<WarrantyTemplateLite[]>([])
  const [warrantyRows, setWarrantyRows] = useState<InvoiceWarrantyDraft[]>([])

  const resetState = useCallback(() => {
    setStep(1)
    setJob(null)
    setExistingInvoice(null)
    setEditingInvoiceId(null)
    setSelectedIds(new Set())
    setDraftLines([])
    setTaxRate(0)
    setDiscountType(null)
    setDiscountValue(0)
    setNotes('')
    setPaymentTerms('')
    setCreatedPayload(null)
    setAddPartPick('')
    setWarrantyRows([])
  }, [])

  useEffect(() => {
    if (!open) {
      resetState()
      return
    }
    void window.electronAPI.settings.get('store.name').then(res => {
      if (!res.success || res.data == null) return
      const raw = String(res.data).trim()
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as unknown
        setStoreName(typeof parsed === 'string' ? parsed : raw)
      } catch {
        setStoreName(raw)
      }
    })
  }, [open, resetState])

  useEffect(() => {
    if (!open) return
    void window.electronAPI.jobCards.listWarrantyTemplates(true).then(res => {
      if (res.success && Array.isArray(res.data)) {
        setWarrantyTemplates(res.data as WarrantyTemplateLite[])
      }
    })
  }, [open])

  useEffect(() => {
    if (!open || !jobId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setStep(1)
      setEditingInvoiceId(null)
      setExistingInvoice(null)
      try {
        const jobRes = await window.electronAPI.jobCards.getById(jobId)
        const invBriefRes = await window.electronAPI.jobCards.getJobInvoiceForJob(jobId)
        if (!jobRes.success || !jobRes.data) {
          toast.error('Could not load job')
          return
        }
        const j = jobRes.data as JobRecord
        if (cancelled) return
        setJob(j)
        const parts = j.parts ?? []
        setSelectedIds(new Set(parts.map(p => p.id)))
        setTaxRate(Number(j.tax_rate ?? 0) || 0)
        const idt = j.invoice_discount_type
        setDiscountType(idt === 'percentage' || idt === 'fixed' ? idt : null)
        setDiscountValue(Number(j.invoice_discount_value ?? 0) || 0)
        setPaymentTerms((j.invoice_payment_terms ?? '').trim())

        if (invBriefRes.success && invBriefRes.data) {
          const brief = invBriefRes.data as { id: number; status: string; invoice_number: string }
          if (brief.status !== 'draft') {
            setExistingInvoice({ invoice_number: brief.invoice_number, locked: true })
            setEditingInvoiceId(null)
            setWarrantyRows([])
            return
          }
          const fullRes = await window.electronAPI.jobCards.getJobInvoice(brief.id)
          if (!fullRes.success || !fullRes.data) {
            setExistingInvoice({ invoice_number: brief.invoice_number, locked: false })
            return
          }
          const inv = fullRes.data as {
            id: number
            invoice_number: string
            status: string
            tax_rate?: number | null
            discount_type?: string | null
            discount_value?: number | null
            notes?: string | null
            payment_terms?: string | null
            items: Array<{
              description: string
              quantity: number
              unit_price: number
              service_catalog_id?: number | null
              default_unit_price?: number | null
              job_part_id?: number | null
            }>
          }
          if (cancelled) return
          if (inv.status !== 'draft') {
            setExistingInvoice({ invoice_number: inv.invoice_number, locked: true })
            setEditingInvoiceId(null)
            setWarrantyRows([])
            return
          }
          setEditingInvoiceId(inv.id)
          setExistingInvoice({ invoice_number: inv.invoice_number, locked: false })
          setDraftLines(
            inv.items.map(it => ({
              lineKey: newLineKey(),
              job_part_id: it.job_part_id ?? null,
              description: (it.description ?? '').trim() || 'Line item',
              quantity: Math.max(1, it.quantity || 1),
              unit_price: Number(it.unit_price) || 0,
              service_catalog_id: it.service_catalog_id ?? null,
              default_unit_price: it.default_unit_price ?? null,
            })),
          )
          setTaxRate(Number(inv.tax_rate ?? j.tax_rate ?? 0) || 0)
          const dt = inv.discount_type
          setDiscountType(dt === 'percentage' || dt === 'fixed' ? dt : null)
          setDiscountValue(Number(inv.discount_value ?? 0) || 0)
          setNotes((inv.notes ?? '').trim())
          setPaymentTerms((inv.payment_terms ?? '').trim())
          const linked = new Set<number>()
          for (const it of inv.items) {
            if (it.job_part_id != null) linked.add(it.job_part_id)
          }
          setSelectedIds(linked.size ? linked : new Set(parts.map(p => p.id)))
          const wRes = await window.electronAPI.jobCards.listJobInvoiceWarranties(inv.id)
          if (!cancelled && wRes.success && Array.isArray(wRes.data)) {
            const def = new Date().toISOString().slice(0, 10)
            setWarrantyRows(rowsFromServer(wRes.data as Record<string, unknown>[], def))
          } else if (!cancelled) {
            setWarrantyRows([])
          }
          setStep(2)
        } else {
          setExistingInvoice(null)
          setWarrantyRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, jobId])

  const togglePart = (id: number, on: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedTotal = useMemo(() => {
    if (!job?.parts) return 0
    return job.parts.filter(p => selectedIds.has(p.id)).reduce((s, p) => s + (p.total ?? p.quantity * p.unit_price), 0)
  }, [job, selectedIds])

  const { subtotal, discountAmount, taxAmount, grandTotal } = useMemo(() => {
    const sub = draftLines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
    const disc = computeDiscount(sub, discountType, discountValue)
    const taxable = Math.max(0, sub - disc)
    const tax = taxable * ((Number(taxRate) || 0) / 100)
    return {
      subtotal: sub,
      discountAmount: disc,
      taxAmount: tax,
      grandTotal: taxable + tax,
    }
  }, [draftLines, discountType, discountValue, taxRate])

  const isEditingDraft = editingInvoiceId != null

  const goStep2 = () => {
    if (!job?.parts?.length) return
    const picked = job.parts.filter(p => selectedIds.has(p.id))
    if (picked.length === 0) {
      toast.error('Select at least one item for the invoice')
      return
    }
    setDraftLines(
      picked.map(p => ({
        lineKey: newLineKey(),
        job_part_id: p.id,
        description: (p.description ?? '').trim() || 'Line item',
        quantity: Math.max(1, p.quantity || 1),
        unit_price: p.unit_price || 0,
        service_catalog_id: p.service_catalog_id ?? null,
        default_unit_price: p.default_unit_price ?? null,
      })),
    )
    setWarrantyRows([])
    setStep(2)
  }

  const updateDraft = (lineKey: string, patch: Partial<Pick<DraftLine, 'quantity' | 'unit_price' | 'description'>>) => {
    setDraftLines(prev => prev.map(l => (l.lineKey === lineKey ? { ...l, ...patch } : l)))
  }

  const removeLine = (lineKey: string) => {
    setDraftLines(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(l => l.lineKey !== lineKey)
    })
  }

  const addManualLine = () => {
    if (!canEditInvoice) {
      toast.error('Adding custom lines requires invoice edit permission')
      return
    }
    setDraftLines(prev => [
      ...prev,
      {
        lineKey: newLineKey(),
        job_part_id: null,
        description: 'Service / parts',
        quantity: 1,
        unit_price: 0.01,
        service_catalog_id: null,
        default_unit_price: null,
      },
    ])
  }

  const addJobPartLine = (part: JobPartRow) => {
    setDraftLines(prev => {
      if (prev.some(l => l.job_part_id === part.id)) {
        toast.error('That job line is already on the invoice')
        return prev
      }
      return [
        ...prev,
        {
          lineKey: newLineKey(),
          job_part_id: part.id,
          description: (part.description ?? '').trim() || 'Line item',
          quantity: Math.max(1, part.quantity || 1),
          unit_price: part.unit_price || 0,
          service_catalog_id: part.service_catalog_id ?? null,
          default_unit_price: part.default_unit_price ?? null,
        },
      ]
    })
    setAddPartPick('')
  }

  const partsAvailableToAdd = useMemo(() => {
    if (!job?.parts?.length) return []
    const onDraft = new Set(draftLines.map(l => l.job_part_id).filter((x): x is number => x != null))
    return job.parts.filter(p => !onDraft.has(p.id))
  }, [job, draftLines])

  const buildItemsPayload = () =>
    draftLines.map(l => ({
      job_part_id: l.job_part_id,
      description: l.description.trim() || 'Line item',
      quantity: l.quantity,
      unit_price: l.unit_price,
      service_catalog_id: l.service_catalog_id,
      default_unit_price: l.default_unit_price,
    }))

  const handleSave = async (): Promise<void> => {
    if (!jobId || draftLines.length === 0) return
    const bad = draftLines.some(l => l.quantity < 1 || l.unit_price <= 0)
    if (bad) {
      toast.error('Each line needs quantity ≥ 1 and unit price greater than 0')
      return
    }
    const hasManual = draftLines.some(l => l.job_part_id == null)
    if (hasManual && !canEditInvoice) {
      toast.error('Custom invoice lines require invoice edit permission')
      return
    }
    if (editingInvoiceId != null && !canEditInvoice) {
      toast.error('Saving invoice changes requires invoice edit permission')
      return
    }

    for (const raw of warrantyRows) {
      if (raw.isFromProduct) continue
      if (!raw.title.trim()) continue
      if (raw.scope === 'line' && raw.job_part_id == null) {
        toast.error('Line warranties must select a job line')
        return
      }
      if (raw.scope === 'service' && raw.service_catalog_id == null && raw.job_part_id == null) {
        toast.error('Service warranty needs a catalog ID or link it to a job line')
        return
      }
    }

    setSaving(true)
    try {
      const items = buildItemsPayload()
      const meta = {
        items,
        notes: notes.trim() || null,
        payment_terms: paymentTerms.trim() || null,
        tax_rate: Number(taxRate) || 0,
        discount_type: discountType,
        discount_value: discountValue,
      }

      const res =
        editingInvoiceId != null
          ? await window.electronAPI.jobCards.updateJobInvoice(editingInvoiceId, meta)
          : await window.electronAPI.jobCards.createJobInvoice(jobId, meta)

      setSaving(false)
      if (!res.success || !res.data) {
        toast.error((res as { error?: string }).error ?? 'Failed to save invoice')
        return
      }
      const inv = res.data as {
        id: number
        invoice_number: string
        total_amount: number
        status: string
        created_at: string
        items: Array<{ description: string; quantity: number; unit_price: number; total_price: number }>
        subtotal?: number | null
        tax_rate?: number | null
        tax_amount?: number | null
        discount_type?: string | null
        discount_value?: number | null
        notes?: string | null
        payment_terms?: string | null
      }

      setEditingInvoiceId(inv.id)

      const wPayload = warrantyDraftsToPayload(warrantyRows)
      const wRes = await window.electronAPI.jobCards.replaceJobInvoiceWarranties(jobId, inv.id, wPayload)
      if (!wRes.success) {
        toast.warning((wRes as { error?: string }).error ?? 'Invoice saved but warranties failed to save')
      } else {
        const wList = await window.electronAPI.jobCards.listJobInvoiceWarranties(inv.id)
        if (wList.success && Array.isArray(wList.data)) {
          const def = new Date().toISOString().slice(0, 10)
          setWarrantyRows(rowsFromServer(wList.data as Record<string, unknown>[], def))
        }
      }

      const vehicleLabel = [job?.vehicle_year, job?.vehicle_make, job?.vehicle_model].filter(Boolean).join(' ') || '—'
      const plate = job?.vehicle_plate ?? ''
      setCreatedPayload({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        status: inv.status,
        created_at: inv.created_at,
        customer_name: job?.owner_name ?? '—',
        vehicle_label: plate ? `${vehicleLabel} · ${plate}` : vehicleLabel,
        job_number: job?.job_number ?? null,
        items: inv.items ?? [],
        subtotal: inv.subtotal,
        tax_rate: inv.tax_rate,
        tax_amount: inv.tax_amount,
        discount_type: inv.discount_type,
        discount_value: inv.discount_value,
        notes: inv.notes,
        payment_terms: inv.payment_terms,
      })
      setStep(3)
      onCreated?.()
      toast.success(
        editingInvoiceId != null ? `Invoice ${inv.invoice_number} updated` : `Invoice ${inv.invoice_number} created`,
      )
    } catch {
      setSaving(false)
      toast.error('Failed to save invoice')
    }
  }

  const handlePrint = (): void => {
    window.print()
  }

  const handleSuccessModalClose = (): void => {
    setCreatedPayload(null)
    setStep(1)
    onClose()
  }

  const handleViewInInvoices = (): void => {
    const num = createdPayload?.invoice_number
    if (!num) return
    setCreatedPayload(null)
    setStep(1)
    onClose()
    navigate(`/invoices?highlight=${encodeURIComponent(num)}`)
  }

  if (!open || !jobId) return null

  const customerName = job?.owner_name ?? '—'
  const vehicleLabel = [job?.vehicle_year, job?.vehicle_make, job?.vehicle_model].filter(Boolean).join(' ') || '—'
  const plate = job?.vehicle_plate ?? ''

  const step1Locked = !!existingInvoice?.locked
  const step1NextDisabled =
    loading || !job?.parts?.length || selectedIds.size === 0 || step1Locked

  return (
    <>
      <Modal
        open={open && step !== 3}
        title={
          step === 1
            ? `Generate invoice — ${job?.job_number ?? 'Job'}`
            : isEditingDraft
              ? `Edit draft invoice — ${job?.job_number ?? 'Job'}`
              : `Invoice preview — ${job?.job_number ?? 'Job'}`
        }
        onClose={onClose}
        size="xl"
        footer={
          step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goStep2}
                disabled={step1NextDisabled}
                className="px-4 py-2 text-sm rounded-md bg-[#0066CC] text-white hover:bg-[#0066CC]/90 disabled:opacity-50 font-medium shadow-sm"
              >
                Next: Preview
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
              >
                Back
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || draftLines.length === 0 || (isEditingDraft && !canEditInvoice)}
                className="px-4 py-2 text-sm rounded-md bg-[#0066CC] text-white hover:bg-[#0066CC]/90 disabled:opacity-50 font-medium shadow-sm"
                title={isEditingDraft && !canEditInvoice ? 'Invoice edit permission required' : undefined}
              >
                {saving ? 'Saving…' : isEditingDraft ? 'Save invoice' : 'Create invoice'}
              </button>
            </>
          )
        }
      >
        <div className="space-y-4 text-sm" aria-live="polite">
          {loading && <p className="text-muted-foreground">Loading job…</p>}
          {!loading && job && step === 1 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Step 1 of 2</span>
                {existingInvoice && (
                  <span
                    className={
                      existingInvoice.locked
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {existingInvoice.locked
                      ? `An invoice exists for this job (${existingInvoice.invoice_number}) and cannot be regenerated here.`
                      : `Draft ${existingInvoice.invoice_number} — adjust line selection here, or go back to step 2 to edit details.`}
                  </span>
                )}
              </div>
              {step1Locked ? (
                <p className="text-sm text-muted-foreground rounded-md border border-border p-3 bg-muted/20">
                  Use the Invoices page to view or print this invoice.
                </p>
              ) : null}
              <div className="rounded-lg border border-border p-3 bg-muted/20">
                <p>
                  <span className="text-muted-foreground">Customer:</span> {customerName}
                </p>
                <p>
                  <span className="text-muted-foreground">Vehicle:</span> {vehicleLabel}
                  {plate ? ` · ${plate}` : ''}
                </p>
              </div>
              <p className="font-medium">Select items to include</p>
              <ul className="space-y-2 max-h-[min(50vh,420px)] overflow-y-auto pr-1">
                {(job.parts ?? []).map(p => {
                  const lineTotal = p.total ?? p.quantity * p.unit_price
                  const fromCat = p.service_catalog_id != null
                  return (
                    <li
                      key={p.id}
                      className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.has(p.id)}
                        disabled={step1Locked}
                        onChange={e => togglePart(p.id, e.target.checked)}
                        aria-label={`Include ${(p.description ?? 'line').slice(0, 80)}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">{(p.description ?? 'Line item').trim() || 'Line item'}</span>
                          {fromCat ? (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Catalog
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Job item
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <CurrencyText amount={p.unit_price} /> × {p.quantity} = <CurrencyText amount={lineTotal} />
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex justify-end border-t border-border pt-3">
                <span className="font-semibold">
                  Selected total: <CurrencyText amount={selectedTotal} />
                </span>
              </div>
            </>
          )}

          {!loading && job && step === 2 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Step 2 of 2</span>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Printer className="w-3.5 h-3.5" /> Print preview
                </button>
              </div>

              <div
                id="job-invoice-print-root"
                className="rounded-lg border border-border p-4 space-y-4 print:shadow-none print:border-0"
              >
                <div className="text-center border-b border-border pb-3">
                  <h3 className="text-xl font-bold">{storeName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {isEditingDraft ? 'Draft invoice (editing)' : 'Invoice preview (draft)'}
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-foreground">Bill to</p>
                    <p>{customerName}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Vehicle</p>
                    <p>
                      {vehicleLabel}
                      {plate ? ` · ${plate}` : ''}
                    </p>
                    {job.vehicle_vin ? <p className="text-muted-foreground">VIN: {job.vehicle_vin}</p> : null}
                  </div>
                </div>
                <p className="text-xs">
                  <span className="text-muted-foreground">Job reference:</span>{' '}
                  <span className="font-mono">{job.job_number}</span>
                  {existingInvoice && !existingInvoice.locked ? (
                    <span className="text-muted-foreground"> · {existingInvoice.invoice_number}</span>
                  ) : null}
                </p>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {canEditInvoice ? (
                    <button
                      type="button"
                      onClick={addManualLine}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add line
                    </button>
                  ) : null}
                  {partsAvailableToAdd.length > 0 ? (
                    <div className="flex items-center gap-1 text-xs">
                      <label htmlFor="invoice-add-part" className="text-muted-foreground whitespace-nowrap">
                        From job:
                      </label>
                      <select
                        id="invoice-add-part"
                        className="border border-input rounded-md px-2 py-1 bg-background max-w-[220px]"
                        value={addPartPick}
                        onChange={e => {
                          const v = e.target.value
                          setAddPartPick(v)
                          if (!v) return
                          const id = Number(v)
                          const part = job.parts?.find(p => p.id === id)
                          if (part) addJobPartLine(part)
                        }}
                      >
                        <option value="">Add job line…</option>
                        {partsAvailableToAdd.map(p => (
                          <option key={p.id} value={p.id}>
                            {(p.description ?? 'Line').slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                <div className="overflow-x-auto border border-border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-start px-2 py-2">Description</th>
                        <th className="text-center px-2 py-2 w-16">Qty</th>
                        <th className="text-end px-2 py-2 w-24">Unit</th>
                        <th className="text-end px-2 py-2 w-24">Line</th>
                        {canEditInvoice ? <th className="w-10 px-1 py-2 print:hidden" /> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draftLines.map((l, i) => {
                        const lineTotal = l.quantity * l.unit_price
                        const overridden =
                          l.default_unit_price != null && Math.abs(l.unit_price - l.default_unit_price) > 1e-6
                        const descEditable = canEditInvoice
                        return (
                          <tr key={l.lineKey} className={i % 2 === 1 ? 'bg-muted/15' : ''}>
                            <td className="px-2 py-2 align-top">
                              {descEditable ? (
                                <div className="flex items-start gap-1 flex-wrap">
                                  <input
                                    type="text"
                                    className="w-full min-w-[120px] border border-input rounded px-1 py-0.5 bg-background"
                                    value={l.description}
                                    onChange={e => updateDraft(l.lineKey, { description: e.target.value })}
                                  />
                                  {overridden ? <span className="text-primary shrink-0">*</span> : null}
                                  {l.job_part_id == null ? (
                                    <span className="text-[10px] uppercase text-muted-foreground shrink-0">Custom</span>
                                  ) : null}
                                </div>
                              ) : (
                                <>
                                  {l.description}
                                  {overridden ? <span className="text-primary ml-1">*</span> : null}
                                  {l.job_part_id == null ? (
                                    <span className="ml-1 text-[10px] uppercase text-muted-foreground">Custom</span>
                                  ) : null}
                                </>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-top">
                              <input
                                type="number"
                                min={1}
                                className="w-14 border border-input rounded px-1 py-0.5 bg-background text-center"
                                value={l.quantity}
                                onChange={e =>
                                  updateDraft(l.lineKey, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 text-end align-top">
                              <input
                                type="number"
                                min={0.01}
                                step={0.01}
                                className="w-24 border border-input rounded px-1 py-0.5 bg-background text-end"
                                value={l.unit_price}
                                onChange={e =>
                                  updateDraft(l.lineKey, { unit_price: Math.max(0.01, parseFloat(e.target.value) || 0) })
                                }
                              />
                            </td>
                            <td className="px-2 py-2 text-end tabular-nums align-top">
                              {formatCurrency(lineTotal)} AED
                            </td>
                            {canEditInvoice ? (
                              <td className="px-1 py-2 text-center align-top print:hidden">
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-30"
                                  disabled={draftLines.length <= 1}
                                  onClick={() => removeLine(l.lineKey)}
                                  aria-label="Remove line"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {draftLines.some(
                  l =>
                    l.default_unit_price != null && Math.abs(l.unit_price - l.default_unit_price) > 1e-6,
                ) && <p className="text-[10px] text-muted-foreground">* Custom price vs catalog default</p>}

                <div className="space-y-2 print:hidden">
                  <label className="block text-xs font-medium">Tax rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="w-full max-w-xs border border-input rounded-md px-2 py-1.5 bg-background"
                    value={taxRate}
                    onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                  />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium">Discount</label>
                      <select
                        className="w-full border border-input rounded-md px-2 py-1.5 bg-background"
                        value={discountType ?? ''}
                        onChange={e =>
                          setDiscountType(
                            e.target.value === 'percentage' || e.target.value === 'fixed' ? e.target.value : null,
                          )
                        }
                      >
                        <option value="">None</option>
                        <option value="percentage">Percent</option>
                        <option value="fixed">Fixed (AED)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Discount value</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-full border border-input rounded-md px-2 py-1.5 bg-background"
                        value={discountValue}
                        onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Notes</label>
                    <textarea
                      className="w-full border border-input rounded-md px-2 py-1.5 bg-background min-h-[56px]"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Shown on invoice"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Payment terms</label>
                    <textarea
                      className="w-full border border-input rounded-md px-2 py-1.5 bg-background min-h-[56px]"
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                    />
                  </div>
                </div>

                <InvoiceWarrantyEditor
                  draftLines={draftLines}
                  templates={warrantyTemplates}
                  rows={warrantyRows}
                  onChange={setWarrantyRows}
                  defaultEffectiveDate={new Date().toISOString().slice(0, 10)}
                  jobCardId={jobId}
                  invoiceId={editingInvoiceId}
                />

                <div className="text-end space-y-1 text-sm border-t border-border pt-3">
                  <p>
                    Subtotal: <CurrencyText amount={subtotal} />
                  </p>
                  {discountAmount > 0 && (
                    <p className="text-muted-foreground">
                      Discount: −<CurrencyText amount={discountAmount} />
                    </p>
                  )}
                  <p>
                    Tax ({Number(taxRate) || 0}%): <CurrencyText amount={taxAmount} />
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    Total: <CurrencyText amount={grandTotal} />
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <InvoiceCreatedModal
        open={open && step === 3 && createdPayload != null}
        data={createdPayload}
        storeName={storeName}
        onClose={handleSuccessModalClose}
        onViewInInvoices={handleViewInInvoices}
      />
    </>
  )
}
