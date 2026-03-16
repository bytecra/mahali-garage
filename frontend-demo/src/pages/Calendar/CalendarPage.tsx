import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import dragAndDropAddon, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { enUS, ar } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import { usePermission } from '../../hooks/usePermission'
import { useAuthStore } from '../../store/authStore'
import { useLangStore } from '../../store/langStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
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

// ── Color mapping ─────────────────────────────────────────────────────────────
function getEventColor(event: CalendarEvent): string {
  if (event.task_type === 'delivery')     return '#3b82f6'  // blue
  if (event.priority === 'high')          return '#ef4444'  // red
  if (event.task_type === 'appointment')  return '#22c55e'  // green
  if (event.task_type === 'reminder')     return '#f59e0b'  // amber
  if (event.priority === 'medium')        return '#22c55e'  // green
  return '#94a3b8'                                          // grey (low)
}

const withDragAndDropFn = typeof dragAndDropAddon === 'function' ? dragAndDropAddon : (dragAndDropAddon as { default?: (C: unknown) => unknown })?.default
// Use drag-and-drop calendar if addon loads (CJS interop); otherwise plain Calendar
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DnDCalendar = typeof withDragAndDropFn === 'function' ? withDragAndDropFn(Calendar as any) : Calendar

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
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const { lang } = useLangStore()
  const isPrivileged = ['owner', 'manager'].includes(role ?? '')
  const canEdit = usePermission('tasks.edit')

  const localizer = buildLocalizer(lang)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentView, setCurrentView] = useState<View>(Views.MONTH)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadEvents = useCallback(async () => {
    setLoading(true)
    // Fetch a window of 3 months around current date for smooth navigation
    const from = startOfMonth(subMonths(currentDate, 1)).toISOString()
    const to = endOfMonth(addMonths(currentDate, 1)).toISOString()
    const res = await window.electronAPI.tasks.getForCalendar(from, to)
    if (res.success) {
      const raw = res.data as RawEvent[]
      const mapped: CalendarEvent[] = raw
        .filter(e => {
          if (typeFilter !== 'all' && e.task_type !== typeFilter) return false
          if (statusFilter !== 'all' && e.status !== statusFilter) return false
          return true
        })
        .map(e => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
        }))
      setEvents(mapped)
    }
    setLoading(false)
  }, [currentDate, typeFilter, statusFilter])

  useEffect(() => { loadEvents() }, [loadEvents])

  const handleEventDrop: withDragAndDropProps<CalendarEvent>['onEventDrop'] = async ({ event, start, end }) => {
    if (!canEdit || event.is_recurring_instance) return
    const res = await window.electronAPI.tasks.update(event.taskId, {
      start_datetime: new Date(start).toISOString(),
      end_datetime:   new Date(end).toISOString(),
    })
    if (res.success) loadEvents()
    else toast.error(res.error ?? t('common.error'))
  }

  const handleEventResize: withDragAndDropProps<CalendarEvent>['onEventResize'] = async ({ event, start, end }) => {
    if (!canEdit || event.is_recurring_instance) return
    const res = await window.electronAPI.tasks.update(event.taskId, {
      start_datetime: new Date(start).toISOString(),
      end_datetime:   new Date(end).toISOString(),
    })
    if (res.success) loadEvents()
  }

  const eventStyleGetter = (event: CalendarEvent) => {
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
            onSelectEvent={event => setSelectedEvent(event as CalendarEvent)}
            onEventDrop={handleEventDrop as any}
            onEventResize={handleEventResize as any}
            eventPropGetter={eventStyleGetter as (event: object) => object}
            resizable={canEdit}
            draggableAccessor={(event: object) => canEdit && !(event as CalendarEvent).is_recurring_instance}
            style={{ height: 'calc(100% - 48px)' }}
            toolbar={false}
            popup
          />
        )}
      </div>

      {/* Event detail modal */}
      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onUpdate={loadEvents} />
    </div>
  )
}
