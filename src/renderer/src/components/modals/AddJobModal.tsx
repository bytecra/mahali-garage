import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import JobDetailsTab, {
  deriveJobBoardDepartment,
  isValidJobLineItem,
  type CatalogSvcRow,
  type JobInventoryProductRow,
  type JobLineItem,
  type JobFormState,
} from './job-tabs/JobDetailsTab'
import type { InspectionMarker, InspectionMarkerType } from '../inspection/carInspectionTypes'
import CarInspectionTab from './job-tabs/CarInspectionTab'
import JobPaymentTab from './job-tabs/JobPaymentTab'
import ProgressTab from './job-tabs/ProgressTab'
import LogTab from './job-tabs/LogTab'
import AttachmentTab from './job-tabs/AttachmentTab'
import CustomerTab from './job-tabs/CustomerTab'
import CarTab from './job-tabs/CarTab'
import type { VehicleOption } from './job-tabs/vehicleOption'
import InvoiceCreatedModal, { type InvoiceCreatedPayload } from './InvoiceCreatedModal'

type TabId = 'job' | 'inspection' | 'payment' | 'progress' | 'log' | 'attachment' | 'customer' | 'car'

interface Props {
  open: boolean
  repairId?: number
  onClose: () => void
  /** After create, returns new id (modal stays open). After update, pass { close: true }. */
  onSaved: (payload: { createdId?: number; close?: boolean }) => void
  /** When set (new job only), show link to return to quick/full chooser. */
  onEntryBackToChooser?: () => void
  /** Opens the full invoice wizard (lines, tax, warranties). Prefer this over quick-generate when set. */
  onOpenInvoiceWizard?: (jobId: number) => void
  /** Increment when the invoice wizard closes so this modal reloads linked invoice data. */
  invoiceWizardRefreshKey?: number
}

interface Technician {
  id: number
  full_name: string
  role: string
  work_department?: string | null
}
interface JobTypeOption { id: number; name: string }

interface CustomerLite {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

function newLineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const EMPTY_LINE = (): JobLineItem => ({
  key: newLineKey(),
  description: '',
  lineDepartment: 'mechanical',
  quantity: 1,
  cost: 0,
  sell: 0,
})

const mkDefaultForm = (): JobFormState => ({
  job_type: 'General Service',
  priority: 'normal',
  status: 'pending',
  technician_id: '',
  bay_number: '',
  mileage_in: '',
  expected_completion: '',
  complaint: '',
  diagnosis: '',
  work_done: '',
  labor_hours: '0',
  labor_rate: '85',
  deposit: '0',
  tax_rate: '0',
  notes: '',
  customer_authorized: false,
  payment_method: '',
  invoice_discount_type: '',
  invoice_discount_value: '0',
  invoice_payment_terms: '',
})

export default function AddJobModal({
  open,
  repairId,
  onClose,
  onSaved,
  onEntryBackToChooser,
  onOpenInvoiceWizard,
  invoiceWizardRefreshKey = 0,
}: Props): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canDelete = usePermission('repairs.delete')
  const isEdit = !!repairId
  const [tab, setTab] = useState<TabId>('job')
  const [saving, setSaving] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceCreated, setInvoiceCreated] = useState<InvoiceCreatedPayload | null>(null)
  const [invoiceCreatedOpen, setInvoiceCreatedOpen] = useState(false)
  const [storeName, setStoreName] = useState('Mahali Garage')
  const [jobNumber, setJobNumber] = useState<string | null>(null)
  const [linkedJobInvoice, setLinkedJobInvoice] = useState<{
    id?: number
    invoice_number: string
    total_amount: number
    status: string
  } | null>(null)

  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [jobTypes, setJobTypes] = useState<JobTypeOption[]>([])
  const [inventoryProducts, setInventoryProducts] = useState<JobInventoryProductRow[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)

  const [form, setForm] = useState<JobFormState>(() => mkDefaultForm())
  const [lineItems, setLineItems] = useState<JobLineItem[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(null)
  const [loadedProfileComplete, setLoadedProfileComplete] = useState(1)
  const [isArchived, setIsArchived] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [attachmentLogTick, setAttachmentLogTick] = useState(0)
  const [markProfileComplete, setMarkProfileComplete] = useState(false)
  const [showInspection, setShowInspection] = useState(false)
  const [inspectionMarkers, setInspectionMarkers] = useState<InspectionMarker[]>([])
  const [inspectionNotes, setInspectionNotes] = useState('')
  const [selectedMarkerType, setSelectedMarkerType] = useState<InspectionMarkerType>('scratch')
  /** Per job / per job invoice: include car diagram on printed invoice */
  const [showInspectionOnInvoice, setShowInspectionOnInvoice] = useState(false)

  const setField = useCallback((key: keyof JobFormState, val: string | boolean) => {
    setForm(f => ({ ...f, [key]: val }))
  }, [])

  const loadCustomer = useCallback(async (id: number) => {
    const res = await window.electronAPI.customers.getById(id)
    if (res.success && res.data) {
      const c = res.data as CustomerLite
      setSelectedCustomer(c)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setTab('job')
    Promise.all([
      window.electronAPI.users.list({}),
      window.electronAPI.vehicles.list({ pageSize: 500 }),
      window.electronAPI.jobTypes.listActive(),
    ]).then(([techRes, vehRes, jtRes]) => {
      if (techRes?.success) setTechnicians((techRes.data as { rows: Technician[] }).rows ?? [])
      if (vehRes?.success) setVehicles((vehRes.data as { items: VehicleOption[] }).items ?? [])
      if (jtRes?.success) setJobTypes(jtRes.data as JobTypeOption[])
    })

    if (isEdit && repairId) {
      window.electronAPI.jobCards.getById(repairId).then(res => {
        if (!res.success || !res.data) return
        const r = res.data as Record<string, unknown>
        setJobNumber((r.job_number as string) ?? null)
        const pc = Number(r.profile_complete ?? 1)
        setLoadedProfileComplete(Number.isFinite(pc) ? pc : 1)
        setIsArchived(Number(r.archived ?? 0) === 1)
        setMarkProfileComplete(false)
        setForm({
          job_type: (r.job_type as string) ?? 'General Service',
          priority: (r.priority as JobFormState['priority']) ?? 'normal',
          status: (r.status as JobFormState['status']) ?? 'pending',
          technician_id: r.technician_id ? String(r.technician_id) : '',
          bay_number: (r.bay_number as string) ?? '',
          mileage_in: r.mileage_in ? String(r.mileage_in) : '',
          expected_completion: (r.expected_completion as string) ?? '',
          complaint: (r.complaint as string) ?? '',
          diagnosis: (r.diagnosis as string) ?? '',
          work_done: (r.work_done as string) ?? '',
          labor_hours: String(r.labor_hours ?? 0),
          labor_rate: String(r.labor_rate ?? 85),
          deposit: String(r.deposit ?? 0),
          tax_rate: String(r.tax_rate ?? 0),
          notes: (r.notes as string) ?? '',
          customer_authorized: !!(r.customer_authorized),
          payment_method: (r.payment_method as string) ?? '',
          invoice_discount_type: (() => {
            const d = String(r.invoice_discount_type ?? '').toLowerCase()
            return d === 'percentage' || d === 'fixed' ? (d as JobFormState['invoice_discount_type']) : ''
          })(),
          invoice_discount_value: String(r.invoice_discount_value ?? 0),
          invoice_payment_terms: (r.invoice_payment_terms as string) ?? '',
        })
        const rawInsp = r.inspection_data as string | null
        if (rawInsp) {
          try {
            const parsed = JSON.parse(rawInsp) as { markers?: InspectionMarker[]; notes?: string }
            setInspectionMarkers(parsed.markers ?? [])
            setInspectionNotes(parsed.notes ?? '')
            setShowInspection((parsed.markers?.length ?? 0) > 0 || Boolean((parsed.notes ?? '').trim()))
          } catch {
            setInspectionMarkers([])
            setInspectionNotes('')
            setShowInspection(false)
          }
        } else {
          setInspectionMarkers([])
          setInspectionNotes('')
          setShowInspection(false)
        }
        setSelectedMarkerType('scratch')
        setShowInspectionOnInvoice(Number(r.invoice_include_inspection ?? 0) === 1)
        if (r.owner_id) void loadCustomer(r.owner_id as number)
        else setSelectedCustomer(null)

        if (r.vehicle_id) {
          setSelectedVehicle({
            id: r.vehicle_id as number,
            make: r.vehicle_make as string,
            model: r.vehicle_model as string,
            year: r.vehicle_year as number | null,
            license_plate: r.vehicle_plate as string | null,
            vin: r.vehicle_vin as string | null,
            color: (r.vehicle_color as string | null) ?? null,
            mileage: (r.vehicle_mileage as number) ?? 0,
            owner_id: r.owner_id as number | null,
            owner_name: r.owner_name as string | null,
          })
        } else setSelectedVehicle(null)

        const existingParts = r.parts as Array<{
          id?: number
          description: string | null
          quantity: number
          unit_price: number
          cost_price?: number | null
          product_id?: number | null
          service_catalog_id?: number | null
          default_unit_price?: number | null
          line_department?: string | null
        }> | undefined
        if (existingParts?.length) {
          setLineItems(
            existingParts.map(p => ({
              key: p.id != null ? `db-${p.id}` : newLineKey(),
              dbId: p.id,
              description: p.description ?? '',
              lineDepartment: p.line_department === 'programming' ? 'programming' : 'mechanical',
              quantity: p.quantity,
              cost: Number(p.cost_price ?? 0) || 0,
              sell: p.unit_price,
              productId: p.product_id != null && Number.isFinite(Number(p.product_id)) ? Number(p.product_id) : undefined,
              catalogId: p.service_catalog_id ?? undefined,
              defaultSellSnapshot:
                p.default_unit_price != null ? Number(p.default_unit_price) : undefined,
            })),
          )
        } else {
          setLineItems([])
        }
      })
    } else {
      setJobNumber(null)
      setForm(mkDefaultForm())
      setLineItems([])
      setSelectedVehicle(null)
      setSelectedCustomer(null)
      setLoadedProfileComplete(1)
      setIsArchived(false)
      setMarkProfileComplete(false)
      setShowInspection(false)
      setInspectionMarkers([])
      setInspectionNotes('')
      setSelectedMarkerType('scratch')
      setShowInspectionOnInvoice(false)
    }
  }, [open, repairId, isEdit, loadCustomer])

  useEffect(() => {
    if (!open) {
      setInvoiceCreatedOpen(false)
      setInvoiceCreated(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !repairId) {
      setLinkedJobInvoice(null)
      return
    }
    void window.electronAPI.jobCards.getJobInvoiceForJob(repairId).then(res => {
      if (res.success && res.data) {
        const d = res.data as {
          id: number
          invoice_number: string
          total_amount: number
          status: string
          include_inspection_on_invoice?: number | null
        }
        setLinkedJobInvoice({
          id: d.id,
          invoice_number: d.invoice_number,
          total_amount: d.total_amount,
          status: d.status,
        })
        setShowInspectionOnInvoice(Number(d.include_inspection_on_invoice ?? 0) === 1)
      } else {
        setLinkedJobInvoice(null)
      }
    })
  }, [open, repairId, invoiceWizardRefreshKey])

  useEffect(() => {
    if (!open) return
    void window.electronAPI.settings.get('store.name').then(res => {
      if (res.success && res.data && String(res.data).trim()) setStoreName(String(res.data).trim())
    })
  }, [open])

  useEffect(() => {
    if (!open) {
      setInventoryProducts([])
      setInventoryLoading(false)
      return
    }
    setInventoryLoading(true)
    let cancelled = false
    void window.electronAPI.products
      .list({ page: 1, pageSize: 8000, is_active: true })
      .then(res => {
        if (cancelled) return
        setInventoryLoading(false)
        if (!res.success || !res.data) return
        const payload = res.data as { items: Array<Record<string, unknown>> }
        const items = payload.items ?? []
        const mapped: JobInventoryProductRow[] = items
          .map(r => ({
            id: Number(r.id),
            name: String(r.name ?? '').trim(),
            sku: r.sku != null ? String(r.sku) : null,
            stock_quantity: Number(r.stock_quantity ?? 0) || 0,
            unit: String(r.unit ?? 'pcs'),
            cost_price: Number(r.cost_price ?? 0) || 0,
            sell_price: Number(r.sell_price ?? 0) || 0,
          }))
          .filter(p => Number.isFinite(p.id) && p.id > 0 && p.name.length > 0)
        setInventoryProducts(mapped)
      })
      .catch(() => {
        if (!cancelled) setInventoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const addProductFromInventory = useCallback((p: JobInventoryProductRow) => {
    setLineItems(prev => [
      ...prev,
      {
        key: newLineKey(),
        description: p.name,
        lineDepartment: 'mechanical',
        quantity: 1,
        cost: Math.max(0, p.cost_price),
        sell: Math.max(0, p.sell_price),
        productId: p.id,
        defaultSellSnapshot: p.sell_price,
      },
    ])
  }, [])

  const handleSelectCustomer = useCallback((c: CustomerLite | null) => {
    setSelectedCustomer(c)
    if (c && selectedVehicle && selectedVehicle.owner_id !== c.id) {
      setSelectedVehicle(null)
    }
  }, [selectedVehicle])

  const handleSelectVehicle = useCallback((v: VehicleOption | null) => {
    setSelectedVehicle(v)
    if (v) {
      setVehicles(prev => (prev.some(x => x.id === v.id) ? prev : [...prev, v]))
      if (v.owner_id) void loadCustomer(v.owner_id)
    }
    setForm(f => ({
      ...f,
      mileage_in: v?.mileage ? String(v.mileage) : f.mileage_in,
    }))
  }, [loadCustomer])

  const handleVehicleRecordUpdated = useCallback((v: VehicleOption) => {
    setVehicles(list => list.map(x => (x.id === v.id ? { ...x, ...v } : x)))
    setSelectedVehicle(cur => (cur?.id === v.id ? { ...cur, ...v } : cur))
  }, [])

  const handleCustomerRecordUpdated = useCallback((c: CustomerLite) => {
    setSelectedCustomer(c)
  }, [])

  const addLine = useCallback(() => {
    setLineItems(prev => [...prev, EMPTY_LINE()])
  }, [])

  const removeLine = useCallback((key: string) => {
    setLineItems(prev => prev.filter(p => p.key !== key))
  }, [])

  const updateLine = useCallback(
    (key: string, patch: Partial<
      Pick<JobLineItem, 'description' | 'lineDepartment' | 'quantity' | 'cost' | 'sell' | 'defaultSellSnapshot' | 'productId'>
    >) => {
      setLineItems(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)))
    },
    [],
  )

  const isCatalogChecked = useCallback(
    (id: number) => lineItems.some(l => l.catalogId === id),
    [lineItems],
  )

  const persistInspectionInvoiceOption = useCallback(
    async (v: boolean): Promise<boolean> => {
      if (!repairId) return true
      if (linkedJobInvoice?.id != null) {
        const res = await window.electronAPI.jobCards.patchJobInvoiceInspection(linkedJobInvoice.id, v)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? 'Could not update invoice option')
          return false
        }
        return true
      }
      const res = await window.electronAPI.jobCards.update(repairId, { invoice_include_inspection: v ? 1 : 0 })
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? 'Could not save option')
        return false
      }
      return true
    },
    [repairId, linkedJobInvoice?.id],
  )

  const handleInspectionOnInvoiceChange = useCallback(
    async (v: boolean) => {
      setShowInspectionOnInvoice(v)
      const ok = await persistInspectionInvoiceOption(v)
      if (!ok) setShowInspectionOnInvoice(!v)
    },
    [persistInspectionInvoiceOption],
  )

  const toggleCatalog = useCallback((row: CatalogSvcRow, on: boolean) => {
    if (!on) {
      setLineItems(prev => prev.filter(l => l.catalogId !== row.id))
      return
    }
    setLineItems(prev => [
      ...prev.filter(l => l.catalogId !== row.id),
      {
        key: newLineKey(),
        description: row.service_name,
        lineDepartment: row.department === 'programming' ? 'programming' : 'mechanical',
        quantity: 1,
        cost: row.price,
        sell: row.price,
        catalogId: row.id,
        defaultSellSnapshot: row.price,
      },
    ])
  }, [])

  const validateLines = useCallback((): boolean => {
    const valid = lineItems.filter(isValidJobLineItem)
    if (valid.length === 0) {
      toast.error(
        'Add at least one line with cost and sell greater than 0. Use a description of at least 3 characters (or keep an inventory product line).',
      )
      return false
    }
    const badMargin = lineItems.some(l => isValidJobLineItem(l) && l.sell < l.cost)
    if (badMargin) {
      toast.warning('Some lines have sell price below cost — review margins.')
    }
    return true
  }, [lineItems])

  const lineValidationRequired = useMemo(() => {
    if (!isEdit) return true
    if (loadedProfileComplete === 1) return true
    return markProfileComplete
  }, [isEdit, loadedProfileComplete, markProfileComplete])

  const handleSave = async (): Promise<void> => {
    if (!selectedCustomer || !selectedVehicle) {
      toast.error('Select a customer and vehicle (Customer and Car tabs).')
      return
    }
    if (lineValidationRequired && !validateLines()) return

    const laborHours = Number(form.labor_hours) || 0
    const laborRate = Number(form.labor_rate) || 0
    const deposit = Number(form.deposit) || 0
    const taxRate = Number(form.tax_rate) || 0

    const inspectionPayload =
      inspectionMarkers.length > 0 || inspectionNotes.trim()
        ? JSON.stringify({ markers: inspectionMarkers, notes: inspectionNotes.trim() })
        : null
    const invDiscType =
      form.invoice_discount_type === 'percentage' || form.invoice_discount_type === 'fixed'
        ? form.invoice_discount_type
        : null

    const payload = {
      vehicle_id: selectedVehicle.id,
      owner_id: selectedCustomer.id,
      job_type: form.job_type,
      department: deriveJobBoardDepartment(lineItems),
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
      inspection_data: inspectionPayload,
      invoice_include_inspection: showInspectionOnInvoice ? 1 : 0,
      payment_method: form.payment_method.trim() || null,
      invoice_discount_type: invDiscType,
      invoice_discount_value: Number(form.invoice_discount_value) || 0,
      invoice_payment_terms: form.invoice_payment_terms.trim() || null,
      ...(isEdit && loadedProfileComplete === 0
        ? { profile_complete: markProfileComplete ? 1 : 0 }
        : !isEdit
          ? { profile_complete: 1 }
          : {}),
    }

    setSaving(true)
    try {
      if (isEdit && repairId) {
        const res = await window.electronAPI.jobCards.update(repairId, { ...payload, status: form.status })
        setSaving(false)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? t('common.error'))
          return
        }
        const existing = await window.electronAPI.jobCards.getById(repairId)
        if (existing.success) {
          const existingParts = (existing.data as { parts: { id: number }[] }).parts
          for (const ep of existingParts) {
            await window.electronAPI.jobCards.removePart(ep.id)
          }
        }
        for (const line of lineItems) {
          if (!isValidJobLineItem(line)) continue
          await window.electronAPI.jobCards.addPart(repairId, {
            description: line.description.trim(),
            quantity: line.quantity,
            unit_price: line.sell,
            cost_price: line.cost,
            line_department: line.lineDepartment,
            ...(line.productId != null ? { product_id: line.productId } : {}),
            ...(line.catalogId != null
              ? {
                  service_catalog_id: line.catalogId,
                  default_unit_price: line.defaultSellSnapshot ?? line.sell,
                }
              : {}),
          })
        }
        toast.success(t('common.success'))
        setAttachmentLogTick(t => t + 1)
        onSaved({ close: true })
      } else {
        const res = await window.electronAPI.jobCards.create({ ...payload, status: form.status })
        setSaving(false)
        if (!res.success || !res.data) {
          toast.error((res as { error?: string }).error ?? t('common.error'))
          return
        }
        const result = res.data as { id: number; job_number: string }
        for (const line of lineItems) {
          if (!isValidJobLineItem(line)) continue
          await window.electronAPI.jobCards.addPart(result.id, {
            description: line.description.trim(),
            quantity: line.quantity,
            unit_price: line.sell,
            cost_price: line.cost,
            line_department: line.lineDepartment,
            ...(line.productId != null ? { product_id: line.productId } : {}),
            ...(line.catalogId != null
              ? {
                  service_catalog_id: line.catalogId,
                  default_unit_price: line.defaultSellSnapshot ?? line.sell,
                }
              : {}),
          })
        }
        toast.success(t('common.success'))
        onSaved({ createdId: result.id })
      }
    } catch {
      setSaving(false)
      toast.error(t('common.error'))
    }
  }

  const handleArchiveToggle = async (): Promise<void> => {
    if (!isEdit || !repairId) return
    setArchiveBusy(true)
    try {
      const res = await window.electronAPI.jobCards.update(repairId, { archived: isArchived ? 0 : 1 })
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? t('common.error'))
        setArchiveBusy(false)
        return
      }
      toast.success(isArchived ? 'Job restored' : 'Job archived')
      setArchiveBusy(false)
      onSaved({ close: true })
    } catch {
      setArchiveBusy(false)
      toast.error(t('common.error'))
    }
  }

  const requestArchiveToggle = (): void => {
    if (isArchived) {
      void handleArchiveToggle()
      return
    }
    setArchiveConfirmOpen(true)
  }

  const handleDeleteJob = async (): Promise<void> => {
    if (!isEdit || !repairId) return
    setDeleteBusy(true)
    try {
      const res = await window.electronAPI.jobCards.delete(repairId)
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? t('common.error'))
        setDeleteBusy(false)
        return
      }
      toast.success('Job deleted')
      setDeleteBusy(false)
      onSaved({ close: true })
    } catch {
      setDeleteBusy(false)
      toast.error(t('common.error'))
    }
  }

  const effectiveJobId = repairId ?? null

  const generateInvoice = async (): Promise<void> => {
    if (!effectiveJobId) {
      toast.error('Save the job before generating an invoice.')
      return
    }
    setInvoiceLoading(true)
    try {
      const dt = form.invoice_discount_type
      const res = await window.electronAPI.jobCards.createJobInvoice(effectiveJobId, {
        tax_rate: Number(form.tax_rate) || 0,
        include_inspection_on_invoice: showInspectionOnInvoice,
        ...(dt === 'percentage' || dt === 'fixed'
          ? { discount_type: dt, discount_value: Number(form.invoice_discount_value) || 0 }
          : {}),
        payment_terms: form.invoice_payment_terms.trim() || null,
        notes: form.notes.trim() || null,
      })
      setInvoiceLoading(false)
      if (!res.success || !res.data) {
        toast.error((res as { error?: string }).error ?? 'Failed')
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
        inspection_data?: string | null
        include_inspection_on_invoice?: number | null
      }
      const cust = selectedCustomer?.name ?? '—'
      const veh = [selectedVehicle?.year, selectedVehicle?.make, selectedVehicle?.model].filter(Boolean).join(' ') || '—'
      const payload: InvoiceCreatedPayload = {
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        status: inv.status,
        created_at: inv.created_at,
        customer_name: cust,
        vehicle_label: veh,
        job_number: jobNumber,
        items: inv.items ?? [],
        subtotal: inv.subtotal,
        tax_rate: inv.tax_rate,
        tax_amount: inv.tax_amount,
        discount_type: inv.discount_type,
        discount_value: inv.discount_value,
        notes: inv.notes,
        payment_terms: inv.payment_terms,
        inspection_data: inv.inspection_data ?? null,
        include_inspection_on_invoice: inv.include_inspection_on_invoice ?? null,
      }
      setInvoiceCreated(payload)
      setInvoiceCreatedOpen(true)
      setLinkedJobInvoice({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        status: inv.status,
      })
      setAttachmentLogTick(t => t + 1)
      onSaved({})
      toast.success(`Invoice ${inv.invoice_number} created`)
    } catch {
      setInvoiceLoading(false)
      toast.error('Failed to generate invoice')
    }
  }

  const handleInvoiceCreatedClose = (): void => {
    setInvoiceCreatedOpen(false)
    setInvoiceCreated(null)
  }

  const handleViewCreatedInvoice = (): void => {
    const num = invoiceCreated?.invoice_number
    if (!num) return
    setInvoiceCreatedOpen(false)
    setInvoiceCreated(null)
    onClose()
    navigate(`/invoices?highlight=${encodeURIComponent(num)}`)
  }

  const canGenerateInvoice =
    !!effectiveJobId &&
    !!selectedCustomer &&
    !!selectedVehicle &&
    lineItems.some(l => l.description.trim().length >= 3 && l.cost > 0 && l.sell > 0)

  const modalTitle =
    isEdit ? (
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span>{t('repairs.editJob')}</span>
        {jobNumber ? (
          <span className="text-base font-mono font-medium text-muted-foreground tabular-nums">{jobNumber}</span>
        ) : null}
      </span>
    ) : (
      t('repairs.addJob')
    )

  const tabs: { id: TabId; label: string }[] = [
    { id: 'job', label: 'Job' },
    { id: 'inspection', label: 'Car inspection' },
    { id: 'payment', label: 'Payment' },
    { id: 'progress', label: 'Progress' },
    { id: 'log', label: 'Log' },
    { id: 'attachment', label: 'Attachment' },
    { id: 'customer', label: 'Customer' },
    { id: 'car', label: 'Car & invoice' },
  ]

  return (
    <>
      <Modal
        open={open}
        title={modalTitle}
        onClose={onClose}
        size="2xl"
        footer={
          <>
            {isEdit && loadedProfileComplete === 0 && (
              <label className="mr-auto flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={markProfileComplete}
                  onChange={e => setMarkProfileComplete(e.target.checked)}
                  className="rounded border-input"
                />
                <span>Mark job profile complete</span>
              </label>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
              {t('common.cancel')}
            </button>
            {isEdit && canDelete && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleteBusy}
                className="px-4 py-2 text-sm rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                {deleteBusy ? t('common.loading') : 'Delete job'}
              </button>
            )}
            {isEdit && (
              <button
                type="button"
                onClick={requestArchiveToggle}
                disabled={archiveBusy}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-60"
              >
                {archiveBusy ? t('common.loading') : (isArchived ? 'Restore' : 'Archive')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4 -mt-1">
          {!isEdit && onEntryBackToChooser && (
            <button
              type="button"
              onClick={onEntryBackToChooser}
              className="text-sm text-primary hover:underline self-start"
            >
              ← Back to create options
            </button>
          )}
          {isEdit && loadedProfileComplete === 0 && (
            <div
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
              role="status"
            >
              Draft job — add line items, pricing, and other details when you are ready. Check &quot;Mark job profile
              complete&quot; below when finished.
            </div>
          )}
          <div className="flex flex-wrap gap-1 border-b border-border pb-0" role="tablist" aria-label="Job sections">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors -mb-px ${
                  tab === id
                    ? 'border-primary text-primary bg-muted/40'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[320px]">
            {tab === 'job' && (
              <JobDetailsTab
                form={form}
                setField={setField}
                lineItems={lineItems}
                technicians={technicians}
                jobTypes={jobTypes}
                selectedVehicle={selectedVehicle}
                addLine={addLine}
                removeLine={removeLine}
                updateLine={updateLine}
                isCatalogChecked={isCatalogChecked}
                toggleCatalog={toggleCatalog}
                inventoryProducts={inventoryProducts}
                inventoryLoading={inventoryLoading}
                onAddProductFromInventory={addProductFromInventory}
              />
            )}
            {tab === 'inspection' && (
              <CarInspectionTab
                showInspection={showInspection}
                setShowInspection={setShowInspection}
                inspectionMarkers={inspectionMarkers}
                setInspectionMarkers={setInspectionMarkers}
                inspectionNotes={inspectionNotes}
                setInspectionNotes={setInspectionNotes}
                selectedMarkerType={selectedMarkerType}
                setSelectedMarkerType={setSelectedMarkerType}
                showInspectionOnInvoice={showInspectionOnInvoice}
                onShowInspectionOnInvoiceChange={handleInspectionOnInvoiceChange}
                hasJobInvoice={Boolean(linkedJobInvoice)}
              />
            )}
            {tab === 'payment' && (
              <JobPaymentTab form={form} setField={setField} lineItems={lineItems} isEdit={isEdit} />
            )}

            {tab === 'progress' && <ProgressTab jobCardId={effectiveJobId} />}
            {tab === 'log' && <LogTab jobCardId={effectiveJobId} refreshKey={attachmentLogTick} />}
            {tab === 'attachment' && (
              <AttachmentTab
                jobCardId={effectiveJobId}
                onMutate={() => setAttachmentLogTick(t => t + 1)}
              />
            )}
            {tab === 'customer' && (
              <CustomerTab
                selectedCustomer={selectedCustomer}
                onSelectCustomer={handleSelectCustomer}
                onCustomerUpdated={handleCustomerRecordUpdated}
              />
            )}
            {tab === 'car' && (
              <CarTab
                jobCardId={effectiveJobId}
                warrantyRefreshKey={attachmentLogTick}
                customerId={selectedCustomer?.id ?? null}
                allVehicles={vehicles}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={handleSelectVehicle}
                onVehicleUpdated={handleVehicleRecordUpdated}
                onOpenInvoiceWizard={
                  onOpenInvoiceWizard && effectiveJobId
                    ? () => onOpenInvoiceWizard(effectiveJobId)
                    : undefined
                }
                onGenerateInvoice={() => void generateInvoice()}
                invoiceLoading={invoiceLoading}
                canGenerateInvoice={canGenerateInvoice}
                linkedJobInvoice={linkedJobInvoice}
                onViewInvoiceInList={num => {
                  onClose()
                  navigate(`/invoices?highlight=${encodeURIComponent(num)}`)
                }}
              />
            )}
          </div>
        </div>
      </Modal>

      <InvoiceCreatedModal
        open={invoiceCreatedOpen}
        data={invoiceCreated}
        storeName={storeName}
        onClose={handleInvoiceCreatedClose}
        onViewInInvoices={handleViewCreatedInvoice}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        title="Archive this job?"
        message="This will hide it from active jobs and move it to Archived Jobs history. You can restore it anytime."
        confirmLabel="Yes, archive"
        cancelLabel="Keep active"
        variant="warning"
        onConfirm={() => {
          setArchiveConfirmOpen(false)
          void handleArchiveToggle()
        }}
        onCancel={() => setArchiveConfirmOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete this job?"
        message="This action permanently removes the job and cannot be undone."
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setDeleteConfirmOpen(false)
          void handleDeleteJob()
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  )
}
