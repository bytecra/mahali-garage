import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import withDragAndDrop, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { enUS, ar } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { usePermission } from '../../hooks/usePermission'
import { useLangStore } from '../../store/langStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { FeatureGate } from '../../components/FeatureGate'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CalendarEvent {
  id: string
  taskId: number
  title: string
  start: Date
  end: Date
  task_type: string
  priority: string
  status: string
  branch: string | null
  assignee_names: string | null
  is_recurring_instance: boolean
  sale_id: number | null
  event_source: 'task' | 'appointment'
  appointment_id?: number
  department?: string
  customer_name?: string
  technician_name?: string | null
}

interface RawEvent {
  id: string
  taskId: number
  title: string
  start: string
  end: string
  task_type: string
  priority: string
  status: string
  branch: string | null
  assignee_names: string | null
  is_recurring_instance: boolean
  sale_id: number | null
}

interface AppointmentRecord {
  id: number
  customer_id: number | null
  customer_name: string
  customer_phone: string | null
  vehicle_id: number | null
  car_company: string | null
  car_model: string | null
  car_year: string | null
  plate_number: string | null
  department: string
  service_notes: string | null
  technician_id: number | null
  technician_name: string | null
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  status: string
  job_card_id: number | null
  created_by: number | null
  created_at: string
}

type CustomerSearchHit = { id: number; name: string; phone: string | null; balance: number }

type VehicleOwnerRow = {
  id: number
  owner_id: number | null
  make: string
  model: string
  year: number | null
  license_plate: string | null
}

function toYMDLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Color mapping ─────────────────────────────────────────────────────────────
function getEventColor(event: CalendarEvent): string {
  if (event.event_source === 'appointment') {
    switch (event.department) {
      case 'mechanical':
        return '#3b82f6'
      case 'programming':
        return '#f97316'
      default:
        return '#22c55e'
    }
  }
  if (event.task_type === 'delivery')     return '#3b82f6'  // blue
  if (event.priority === 'high')          return '#ef4444'  // red
  if (event.task_type === 'appointment')  return '#22c55e'  // green
  if (event.task_type === 'reminder')     return '#f59e0b'  // amber
  if (event.priority === 'medium')        return '#22c55e'  // green
  return '#94a3b8'                                          // grey (low)
}

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar as React.ComponentType<Parameters<typeof Calendar>[0]>)

// ── Localize date-fns ─────────────────────────────────────────────────────────
const locales = { 'en-US': enUS, 'ar': ar }

function buildLocalizer(lang: string) {
  return dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: lang === 'ar' ? 6 : 0 }),
    getDay,
    locales,
  })
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function EventDetailModal({ event, onClose, onUpdate }: {
  event: CalendarEvent | null
  onClose: () => void
  onUpdate: () => void
}): JSX.Element | null {
  const { t } = useTranslation()
  if (!event) return null

  const color = getEventColor(event)
  const STATUS_LABEL: Record<string, string> = {
    pending: t('tasks.status.pending'),
    in_progress: t('tasks.status.in_progress'),
    done: t('tasks.status.done'),
    cancelled: t('tasks.status.cancelled'),
  }

  const handleStatusChange = async (newStatus: string) => {
    const res = await window.electronAPI.tasks.update(event.taskId, { status: newStatus })
    if (res.success) { toast.success(t('common.success')); onUpdate(); onClose() }
    else toast.error(res.error ?? t('common.error'))
  }

  return (
    <Modal open={!!event} title={event.title} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm text-muted-foreground capitalize">{event.task_type}</span>
          {event.is_recurring_instance && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">↻ {t('tasks.recurring')}</span>}
        </div>
        <div className="text-sm space-y-1.5">
          <p><span className="font-medium">{t('common.status')}:</span> {STATUS_LABEL[event.status] ?? event.status}</p>
          <p><span className="font-medium">{t('repairs.priority')}:</span> {event.priority}</p>
          <p><span className="font-medium">{t('tasks.startDate')}:</span> {format(event.start, 'PPp')}</p>
          <p><span className="font-medium">{t('tasks.endDate')}:</span> {format(event.end, 'PPp')}</p>
          {event.assignee_names && <p><span className="font-medium">{t('tasks.assignees')}:</span> {event.assignee_names}</p>}
          {event.branch && <p><span className="font-medium">{t('expenses.branch')}:</span> {event.branch}</p>}
        </div>
        {!event.is_recurring_instance && event.status !== 'done' && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">{t('tasks.changeStatus')}</p>
            <div className="flex gap-2 flex-wrap">
              {['pending','in_progress','done'].filter(s => s !== event.status).map(s => (
                <button key={s} onClick={() => handleStatusChange(s)}
                  className="px-2.5 py-1 text-xs rounded-full border border-border hover:bg-muted capitalize">
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function AppointmentFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const canEditCustomers = usePermission('customers.edit')

  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchHit[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchHit | null>(null)
  const [vehicles, setVehicles] = useState<VehicleOwnerRow[]>([])
  const [vehicleChoice, setVehicleChoice] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [carCompany, setCarCompany] = useState('')
  const [carModel, setCarModel] = useState('')
  const [carYear, setCarYear] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [department, setDepartment] = useState<'mechanical' | 'programming' | 'both'>('mechanical')
  const [serviceNotes, setServiceNotes] = useState('')
  const [appointmentDate, setAppointmentDate] = useState(() => toYMDLocal(new Date()))
  const [appointmentTime, setAppointmentTime] = useState('09:00')
  const [durationPreset, setDurationPreset] = useState<'30' | '60' | '120' | '180' | 'custom'>('60')
  const [durationMinutesCustom, setDurationMinutesCustom] = useState(60)
  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [employees, setEmployees] = useState<Array<{ id: number; full_name: string; department: string | null }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [isNewCar, setIsNewCar] = useState(false)

  useEffect(() => {
    void (async () => {
      const empRes = (await window.electronAPI.employees.list({ status: 'active' })) as {
        success: boolean
        data?: Array<{ id: number; full_name: string; department: string | null }>
      }
      if (empRes?.success && empRes.data) {
        setEmployees(
          empRes.data.map((e) => ({
            id: e.id,
            full_name: String(e.full_name ?? ''),
            department: e.department ?? null,
          })),
        )
      }
    })()
  }, [])

  useEffect(() => {
    const q = customerQuery.trim()
    if (q.length < 2 || isNewCustomer) {
      setCustomerResults([])
      return
    }
    const tmr = window.setTimeout(() => {
      void (async () => {
        const res = await window.electronAPI.customers.search(q)
        if (res.success && Array.isArray(res.data)) setCustomerResults(res.data as CustomerSearchHit[])
        else setCustomerResults([])
      })()
    }, 300)
    return () => window.clearTimeout(tmr)
  }, [customerQuery, isNewCustomer])

  const durationMinutes =
    durationPreset === 'custom' ? Math.max(15, durationMinutesCustom) : Number(durationPreset)

  const filteredTechnicians = employees.filter((e) => {
    const d = (e.department || '').toLowerCase()
    if (department === 'both') return true
    if (department === 'mechanical') return d === 'mechanical' || d === 'both' || d === ''
    if (department === 'programming') return d === 'programming' || d === 'both' || d === ''
    return true
  })

  const pickVehicle = (idStr: string) => {
    setVehicleChoice(idStr)
    if (idStr === 'new' || idStr === '') {
      if (idStr === 'new') setIsNewCar(true)
      return
    }
    setIsNewCar(false)
    const v = vehicles.find((x) => String(x.id) === idStr)
    if (v) {
      setCarCompany(v.make ?? '')
      setCarModel(v.model ?? '')
      setCarYear(v.year != null ? String(v.year) : '')
      setPlateNumber(v.license_plate ?? '')
    }
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setVehicles([])
    setVehicleChoice('')
    setIsNewCar(false)
    setCarCompany('')
    setCarModel('')
    setCarYear('')
    setPlateNumber('')
  }

  const selectCustomer = async (c: CustomerSearchHit) => {
    setSelectedCustomer(c)
    setCustomerName(c.name)
    setCustomerPhone(c.phone ?? '')
    setCustomerQuery('')
    setCustomerResults([])
    const vRes = await window.electronAPI.vehicles.getByOwner(c.id)
    const list = (vRes.success && Array.isArray(vRes.data) ? vRes.data : []) as VehicleOwnerRow[]
    setVehicles(list)
    setVehicleChoice('')
    setIsNewCar(false)
    setCarCompany('')
    setCarModel('')
    setCarYear('')
    setPlateNumber('')
  }

  const handleSave = async () => {
    setError(null)
    if (!appointmentDate || !appointmentTime) {
      setError(t('common.error'))
      return
    }
    if (!isNewCustomer && !selectedCustomer) {
      setError(t('calendar.pickCustomer', { defaultValue: 'Select a customer' }))
      return
    }
    const nameRequired = (isNewCustomer ? customerName : selectedCustomer?.name ?? customerName).trim()
    if (!nameRequired) {
      setError(t('common.error'))
      return
    }

    setSaving(true)
    try {
      let customerId: number | undefined = selectedCustomer?.id
      if (isNewCustomer) {
        if (!canEditCustomers) {
          setError(t('common.error'))
          setSaving(false)
          return
        }
        const cr = await window.electronAPI.customers.create({
          name: customerName.trim(),
          phone: customerPhone.trim() || null,
          email: null,
          address: null,
          notes: null,
          balance: 0,
        })
        if (!cr.success || !cr.data || typeof (cr.data as { id?: number }).id !== 'number') {
          setError((cr as { error?: string }).error ?? t('common.error'))
          setSaving(false)
          return
        }
        customerId = (cr.data as { id: number }).id
      }

      let vehicleId: number | undefined
      if (selectedCustomer && vehicleChoice && vehicleChoice !== 'new') {
        vehicleId = Number(vehicleChoice)
      }

      const createRes = await window.electronAPI.appointments.create({
        customer_id: customerId,
        customer_name: nameRequired,
        customer_phone: customerPhone.trim() || undefined,
        vehicle_id: vehicleId,
        car_company: carCompany.trim() || undefined,
        car_model: carModel.trim() || undefined,
        car_year: carYear.trim() || undefined,
        plate_number: plateNumber.trim() || undefined,
        department,
        service_notes: serviceNotes.trim() || undefined,
        technician_id: technicianId === '' ? undefined : technicianId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime.length === 5 ? `${appointmentTime}:00` : appointmentTime,
        duration_minutes: durationMinutes,
      })
      if (!createRes.success) {
        setError(createRes.error ?? t('common.error'))
        setSaving(false)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={t('calendar.newAppointment', { defaultValue: 'New appointment' })} onClose={onClose} size="md">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pe-1">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('calendar.sectionCustomer', { defaultValue: 'Customer' })}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isNewCustomer}
              onChange={(e) => {
                setIsNewCustomer(e.target.checked)
                if (e.target.checked) clearCustomer()
              }}
            />
            {t('calendar.walkInCustomer', { defaultValue: 'Walk-in / new customer' })}
          </label>
          {!isNewCustomer && !selectedCustomer && (
            <>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder={t('calendar.searchCustomer', { defaultValue: 'Search customer (min 2 chars)' })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
              {customerResults.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border max-h-36 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    >
                      {c.name}
                      {c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {!isNewCustomer && selectedCustomer && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm px-2 py-1 rounded-md bg-muted">
                {selectedCustomer.name}
                <button type="button" className="ms-2 text-muted-foreground hover:text-foreground" onClick={clearCustomer}>
                  ×
                </button>
              </span>
            </div>
          )}
          {isNewCustomer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('customers.name', { defaultValue: 'Name' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t('customers.phone', { defaultValue: 'Phone' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('calendar.sectionVehicle', { defaultValue: 'Vehicle' })}
          </p>
          {selectedCustomer && vehicles.length > 0 && !isNewCustomer && (
            <select
              value={vehicleChoice}
              onChange={(e) => pickVehicle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">{t('calendar.selectVehicle', { defaultValue: 'Select vehicle' })}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.make} {v.model}
                  {v.license_plate ? ` · ${v.license_plate}` : ''}
                </option>
              ))}
              <option value="new">{t('calendar.addNewCar', { defaultValue: 'Add new car' })}</option>
            </select>
          )}
          {(isNewCustomer || isNewCar || (selectedCustomer && vehicles.length === 0)) && (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={carCompany}
                onChange={(e) => setCarCompany(e.target.value)}
                placeholder={t('vehicles.make', { defaultValue: 'Make' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
              <input
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
                placeholder={t('vehicles.model', { defaultValue: 'Model' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
              <input
                value={carYear}
                onChange={(e) => setCarYear(e.target.value)}
                placeholder={t('vehicles.year', { defaultValue: 'Year' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
              <input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder={t('vehicles.plate', { defaultValue: 'Plate' })}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('calendar.sectionDetails', { defaultValue: 'Appointment details' })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as typeof department)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="mechanical">{t('calendar.dept.mechanical', { defaultValue: 'Mechanical' })}</option>
              <option value="programming">{t('calendar.dept.programming', { defaultValue: 'Programming' })}</option>
              <option value="both">{t('calendar.dept.both', { defaultValue: 'Both' })}</option>
            </select>
            <select
              value={String(technicianId)}
              onChange={(e) => setTechnicianId(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">{t('calendar.noTechnician', { defaultValue: 'No technician' })}</option>
              {filteredTechnicians.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              min={toYMDLocal(new Date())}
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            />
            <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
            <select
              value={durationPreset}
              onChange={(e) => setDurationPreset(e.target.value as typeof durationPreset)}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background sm:col-span-2"
            >
              <option value="30">30 min</option>
              <option value="60">1 hr</option>
              <option value="120">2 hr</option>
              <option value="180">3 hr</option>
              <option value="custom">{t('calendar.durationCustom', { defaultValue: 'Custom' })}</option>
            </select>
            {durationPreset === 'custom' && (
              <input
                type="number"
                min={15}
                step={5}
                value={durationMinutesCustom}
                onChange={(e) => setDurationMinutesCustom(Number(e.target.value) || 60)}
                className="px-3 py-2 text-sm border border-border rounded-lg bg-background sm:col-span-2"
              />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('calendar.notes', { defaultValue: 'Notes' })}</p>
          <textarea
            value={serviceNotes}
            onChange={(e) => setServiceNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('calendar.saveAppointment', { defaultValue: 'Save appointment' })}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AppointmentDetailModal({
  appointment,
  onClose,
  onUpdate,
}: {
  appointment: AppointmentRecord
  onClose: () => void
  onUpdate: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const canSales = usePermission('sales.create')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
      arrived: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
      in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      completed: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    }
    return map[s] ?? 'bg-muted text-foreground'
  }

  const patchStatus = async (next: string) => {
    const res = await window.electronAPI.appointments.updateStatus(appointment.id, next)
    if (res.success) {
      toast.success(t('common.success'))
      onUpdate()
    } else toast.error(res.error ?? t('common.error'))
  }

  const handleDeleteConfirmed = async () => {
    setDeleteConfirmOpen(false)
    const res = await window.electronAPI.appointments.delete(appointment.id)
    if (res.success) {
      toast.success(t('common.success'))
      onUpdate()
      onClose()
    } else {
      toast.error(res.error ?? t('common.error'))
    }
  }

  const timeNorm = appointment.appointment_time.length === 5 ? `${appointment.appointment_time}:00` : appointment.appointment_time
  const startLabel = format(new Date(`${appointment.appointment_date}T${timeNorm}`), 'PPp')

  return (
    <>
    <Modal
      open
      title={appointment.customer_name}
      onClose={() => {
        if (!deleteConfirmOpen) onClose()
      }}
      size="sm"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusBadge(appointment.status)}`}>{appointment.status.replace(/_/g, ' ')}</span>
          {(appointment.car_company || appointment.car_model) && (
            <span className="text-sm text-muted-foreground">
              {[appointment.car_company, appointment.car_model].filter(Boolean).join(' ')}
              {appointment.plate_number ? ` · ${appointment.plate_number}` : ''}
            </span>
          )}
        </div>
        <div className="text-sm space-y-1.5">
          <p>
            <span className="font-medium">{t('calendar.when', { defaultValue: 'When' })}:</span> {startLabel}
          </p>
          <p>
            <span className="font-medium">{t('calendar.duration', { defaultValue: 'Duration' })}:</span> {appointment.duration_minutes} min
          </p>
          <p>
            <span className="font-medium">{t('expenses.branch', { defaultValue: 'Department' })}:</span>{' '}
            <span className="capitalize">{appointment.department}</span>
          </p>
          {appointment.technician_name && (
            <p>
              <span className="font-medium">{t('tasks.assignees', { defaultValue: 'Technician' })}:</span> {appointment.technician_name}
            </p>
          )}
          {appointment.customer_phone && (
            <p>
              <span className="font-medium">{t('customers.phone', { defaultValue: 'Phone' })}:</span> {appointment.customer_phone}
            </p>
          )}
          {appointment.service_notes && (
            <p>
              <span className="font-medium">{t('calendar.notes', { defaultValue: 'Notes' })}:</span> {appointment.service_notes}
            </p>
          )}
        </div>

        {canSales && (
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground">{t('calendar.statusActions', { defaultValue: 'Update status' })}</p>
            <div className="flex flex-wrap gap-2">
              {appointment.status === 'scheduled' && (
                <>
                  <button type="button" onClick={() => void patchStatus('arrived')} className="px-2.5 py-1 text-xs rounded-full border border-border hover:bg-muted">
                    {t('calendar.markArrived', { defaultValue: 'Mark arrived' })}
                  </button>
                  <button type="button" onClick={() => void patchStatus('cancelled')} className="px-2.5 py-1 text-xs rounded-full border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300">
                    {t('common.cancel')}
                  </button>
                </>
              )}
              {appointment.status === 'arrived' && (
                <button type="button" onClick={() => void patchStatus('in_progress')} className="px-2.5 py-1 text-xs rounded-full border border-border hover:bg-muted">
                  {t('calendar.markInProgress', { defaultValue: 'Mark in progress' })}
                </button>
              )}
              {appointment.status === 'in_progress' && (
                <button type="button" onClick={() => void patchStatus('completed')} className="px-2.5 py-1 text-xs rounded-full border border-border hover:bg-muted">
                  {t('calendar.markCompleted', { defaultValue: 'Mark completed' })}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            className="px-2.5 py-1 text-xs rounded-full border border-dashed border-border text-muted-foreground cursor-not-allowed"
            title={t('calendar.convertSoon', { defaultValue: 'Coming soon' })}
          >
            {t('calendar.convertJobCard', { defaultValue: 'Convert to job card' })}
          </button>
          {canSales && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="px-2.5 py-1 text-xs rounded-full border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={deleteConfirmOpen}
      title={t('calendar.deleteAppointmentTitle', { defaultValue: 'Delete this appointment?' })}
      message={t('calendar.deleteAppointmentMessage', {
        defaultValue: 'This booking will be removed from the calendar. You cannot undo this action.',
      })}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      variant="danger"
      onConfirm={() => void handleDeleteConfirmed()}
      onCancel={() => setDeleteConfirmOpen(false)}
    />
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CalendarPage(): JSX.Element {
  return (
    <FeatureGate feature="calendar.view">
      <CalendarPageInner />
    </FeatureGate>
  )
}

function CalendarPageInner(): JSX.Element {
  const { t } = useTranslation()
  const { lang } = useLangStore()
  const canEdit = usePermission('tasks.edit')
  const canBook = usePermission('sales.create')

  const localizer = buildLocalizer(lang)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentView, setCurrentView] = useState<View>(Views.MONTH)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null)
  const [appointmentDetailOpen, setAppointmentDetailOpen] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    // Fetch a window of 3 months around current date for smooth navigation
    const from = startOfMonth(subMonths(currentDate, 1)).toISOString()
    const to = endOfMonth(addMonths(currentDate, 1)).toISOString()
    const [taskRes, apptRes] = await Promise.all([
      window.electronAPI.tasks.getForCalendar(from, to),
      window.electronAPI.appointments.list({ from, to }),
    ])
    let mapped: CalendarEvent[] = []
    if (taskRes.success) {
      const raw = taskRes.data as RawEvent[]
      mapped = raw
        .filter((e) => {
          if (typeFilter !== 'all' && e.task_type !== typeFilter) return false
          if (statusFilter !== 'all' && e.status !== statusFilter) return false
          return true
        })
        .map((e) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
          event_source: 'task' as const,
        }))
    }
    let apptEvents: CalendarEvent[] = []
    if (apptRes?.success && Array.isArray(apptRes.data)) {
      apptEvents = (apptRes.data as AppointmentRecord[]).map((a) => {
        const timePart = a.appointment_time.length === 5 ? `${a.appointment_time}:00` : a.appointment_time
        const startDt = new Date(`${a.appointment_date}T${timePart}`)
        const endDt = new Date(startDt.getTime() + (a.duration_minutes || 60) * 60 * 1000)
        return {
          id: `appt-${a.id}`,
          taskId: 0,
          title: `📅 ${a.customer_name}${a.car_company ? ` · ${a.car_company}` : ''}`,
          start: startDt,
          end: endDt,
          task_type: 'appointment',
          priority: 'medium',
          status: a.status,
          branch: null,
          assignee_names: a.technician_name,
          is_recurring_instance: false,
          sale_id: null,
          event_source: 'appointment' as const,
          appointment_id: a.id,
          department: a.department,
          customer_name: a.customer_name,
          technician_name: a.technician_name,
        }
      })
    }
    setEvents([...mapped, ...apptEvents])
    setLoading(false)
  }, [currentDate, typeFilter, statusFilter])

  useEffect(() => { loadEvents() }, [loadEvents])

  const handleEventDrop: withDragAndDropProps<CalendarEvent>['onEventDrop'] = async ({ event, start, end }) => {
    if (!canEdit || event.is_recurring_instance || event.event_source === 'appointment') return
    const res = await window.electronAPI.tasks.update(event.taskId, {
      start_datetime: new Date(start).toISOString(),
      end_datetime:   new Date(end).toISOString(),
    })
    if (res.success) loadEvents()
    else toast.error(res.error ?? t('common.error'))
  }

  const handleEventResize: withDragAndDropProps<CalendarEvent>['onEventResize'] = async ({ event, start, end }) => {
    if (!canEdit || event.is_recurring_instance || event.event_source === 'appointment') return
    const res = await window.electronAPI.tasks.update(event.taskId, {
      start_datetime: new Date(start).toISOString(),
      end_datetime:   new Date(end).toISOString(),
    })
    if (res.success) loadEvents()
  }

  const handleSelectEvent = useCallback(
    async (event: CalendarEvent) => {
      if (event.event_source === 'appointment' && event.appointment_id) {
        const res = await window.electronAPI.appointments.getById(event.appointment_id)
        if (res?.success && res.data) {
          setSelectedAppointment(res.data as AppointmentRecord)
          setAppointmentDetailOpen(true)
        }
        return
      }
      setSelectedEvent(event)
    },
    [],
  )

  const eventStyleGetter = (event: CalendarEvent) => {
    if (event.event_source === 'appointment') {
      switch (event.department) {
        case 'mechanical':
          return {
            style: {
              backgroundColor: '#3b82f6',
              borderColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              padding: '2px 6px',
              opacity: event.status === 'cancelled' ? 0.4 : 1,
            },
          }
        case 'programming':
          return {
            style: {
              backgroundColor: '#f97316',
              borderColor: '#ea580c',
              color: '#ffffff',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              padding: '2px 6px',
              opacity: event.status === 'cancelled' ? 0.4 : 1,
            },
          }
        default:
          return {
            style: {
              backgroundColor: '#22c55e',
              borderColor: '#16a34a',
              color: '#ffffff',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              padding: '2px 6px',
              opacity: event.status === 'cancelled' ? 0.4 : 1,
            },
          }
      }
    }
    const color = getEventColor(event)
    return {
      style: {
        backgroundColor: color,
        borderColor: color,
        color: '#fff',
        borderRadius: '6px',
        border: 'none',
        fontSize: '12px',
        padding: '2px 6px',
        opacity: event.status === 'cancelled' ? 0.4 : 1,
      },
    }
  }

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">{t('calendar.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canBook && (
            <button
              type="button"
              onClick={() => setShowAppointmentForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              {t('calendar.newAppointmentBtn', { defaultValue: '📅 New Appointment' })}
            </button>
          )}
          {/* View switcher */}
          {([Views.MONTH, Views.WEEK, Views.DAY] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setCurrentView(v)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                currentView === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground">
          <option value="all">{t('common.all')} {t('tasks.type')}</option>
          <option value="task">{t('tasks.taskType.task')}</option>
          <option value="delivery">{t('tasks.taskType.delivery')}</option>
          <option value="appointment">{t('tasks.taskType.appointment')}</option>
          <option value="reminder">{t('tasks.taskType.reminder')}</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground">
          <option value="all">{t('common.all')} {t('common.status')}</option>
          <option value="pending">{t('tasks.status.pending')}</option>
          <option value="in_progress">{t('tasks.status.in_progress')}</option>
          <option value="done">{t('tasks.status.done')}</option>
        </select>
        {/* Color legend */}
        <div className="flex items-center gap-3 ms-auto text-xs text-muted-foreground">
          {[
            { color: '#3b82f6', label: t('tasks.taskType.delivery') },
            { color: '#ef4444', label: t('tasks.priority.high') },
            { color: '#22c55e', label: t('tasks.priority.medium') },
            { color: '#f59e0b', label: t('tasks.taskType.reminder') },
          ].map(item => (
            <span key={item.color} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 bg-card border border-border rounded-xl overflow-hidden p-2
        [&_.rbc-calendar]:h-full [&_.rbc-toolbar]:hidden
        [&_.rbc-header]:bg-muted/30 [&_.rbc-header]:border-border [&_.rbc-header]:text-muted-foreground [&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:py-2
        [&_.rbc-month-view]:border-border [&_.rbc-day-bg]:border-border
        [&_.rbc-today]:bg-primary/5
        [&_.rbc-off-range-bg]:bg-muted/20
        [&_.rbc-event]:cursor-pointer
        [&_.rbc-time-content]:border-border [&_.rbc-time-header]:border-border
        [&_.rbc-current-time-indicator]:bg-primary">

        {/* Custom toolbar */}
        <div className="flex items-center justify-between px-2 pb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(d => {
              if (currentView === Views.MONTH) return subMonths(d, 1)
              if (currentView === Views.WEEK) return new Date(d.getTime() - 7 * 86400000)
              return new Date(d.getTime() - 86400000)
            })} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm rounded-md hover:bg-muted">
              {t('calendar.today')}
            </button>
            <button onClick={() => setCurrentDate(d => {
              if (currentView === Views.MONTH) return addMonths(d, 1)
              if (currentView === Views.WEEK) return new Date(d.getTime() + 7 * 86400000)
              return new Date(d.getTime() + 86400000)
            })} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            {format(currentDate, currentView === Views.DAY ? 'MMMM d, yyyy' : currentView === Views.WEEK ? 'MMMM yyyy' : 'MMMM yyyy')}
          </h2>
          <div className="w-24" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <DnDCalendar
            localizer={localizer}
            events={events}
            date={currentDate}
            view={currentView}
            onNavigate={setCurrentDate}
            onView={setCurrentView}
            onSelectEvent={(ev) => void handleSelectEvent(ev)}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            eventPropGetter={eventStyleGetter}
            resizable={canEdit}
            draggableAccessor={(event: CalendarEvent) =>
              canEdit && !event.is_recurring_instance && event.event_source !== 'appointment'
            }
            resizableAccessor={(event: CalendarEvent) =>
              canEdit && !event.is_recurring_instance && event.event_source !== 'appointment'
            }
            style={{ height: 'calc(100% - 48px)' }}
            toolbar={false}
            popup
          />
        )}
      </div>

      {/* Event detail modal */}
      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onUpdate={loadEvents} />

      {showAppointmentForm && (
        <AppointmentFormModal
          onClose={() => setShowAppointmentForm(false)}
          onSaved={() => {
            setShowAppointmentForm(false)
            void loadEvents()
          }}
        />
      )}

      {appointmentDetailOpen && selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => {
            setAppointmentDetailOpen(false)
            setSelectedAppointment(null)
          }}
          onUpdate={() => {
            setAppointmentDetailOpen(false)
            setSelectedAppointment(null)
            void loadEvents()
          }}
        />
      )}
    </div>
  )
}
