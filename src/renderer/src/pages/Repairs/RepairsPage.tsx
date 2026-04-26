import { useState, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, LayoutGrid, List, Pencil, PanelRight, Archive, ArchiveRestore, CheckCircle2 } from 'lucide-react'
import {
  DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors,
  closestCorners, DragOverlay, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import { formatDate } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import RepairCard, { RepairRow, jobCardToastHint } from './RepairCard'
import AddJobModal from '../../components/modals/AddJobModal'
import JobCreationChooserModal from '../../components/modals/JobCreationChooserModal'
import QuickCreateJobModal from '../../components/modals/QuickCreateJobModal'
import { FeatureGate } from '../../components/FeatureGate'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import SearchInput from '../../components/shared/SearchInput'
import JobDetailDrawer from '../../components/job-details/JobDetailDrawer'
import JobInvoiceWizardModal from '../../components/modals/JobInvoiceWizardModal'
import { useAuthStore } from '../../store/authStore'

const KANBAN_COLS = [
  { status: 'pending',             label: 'Pending',                 color: 'bg-slate-50 dark:bg-slate-950/30',     ring: 'ring-slate-400 dark:ring-slate-500' },
  { status: 'in_progress',         label: 'In Progress',             color: 'bg-blue-50 dark:bg-blue-950/30',       ring: 'ring-blue-400 dark:ring-blue-500' },
  { status: 'waiting_parts',       label: 'Waiting for Parts',       color: 'bg-yellow-50 dark:bg-yellow-950/30',   ring: 'ring-yellow-400 dark:ring-yellow-500' },
  { status: 'waiting_for_programming', label: 'Waiting for Programming', color: 'bg-violet-50 dark:bg-violet-950/30',   ring: 'ring-violet-400 dark:ring-violet-500' },
  { status: 'ready',               label: 'Ready for Pickup',        color: 'bg-green-50 dark:bg-green-950/30',     ring: 'ring-green-400 dark:ring-green-500' },
  { status: 'completed_delivered', label: 'Completed / Delivered',   color: 'bg-emerald-50 dark:bg-emerald-950/30', ring: 'ring-emerald-400 dark:ring-emerald-500' },
] as const

type KanbanStatus = typeof KANBAN_COLS[number]['status']

const STATUS_COLORS: Record<string, string> = {
  pending:             'bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-400',
  in_progress:         'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  waiting_parts:       'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  waiting_for_programming: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  ready:               'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  completed_delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  delivered:           'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  cancelled:           'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  low:    'bg-muted text-muted-foreground',
}

const DEPT_LIST_BADGE: Record<string, string> = {
  mechanical:  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  programming: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300',
  both:        'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300',
}

function listDeptLabel(d: string | undefined): string {
  if (d === 'programming') return 'Programming'
  if (d === 'both') return 'Both'
  return 'Mechanical'
}

const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6']

const ALL_STATUS_OPTIONS = [
  'pending', 'in_progress', 'waiting_parts', 'waiting_for_programming',
  'ready', 'completed_delivered', 'delivered', 'cancelled',
]

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending:             'Pending',
    in_progress:         'In Progress',
    waiting_parts:       'Waiting for Parts',
    waiting_for_programming: 'Waiting for Programming',
    ready:               'Ready for Pickup',
    completed_delivered: 'Completed / Delivered',
    delivered:           'Delivered (legacy)',
    cancelled:           'Cancelled',
  }
  return map[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function normalizeRepairStatus(status: string): string {
  if (status === 'waiting_programming') return 'waiting_for_programming'
  return status
}

// ── Droppable column wrapper ────────────────────────────────────────────────
function DroppableColumn({
  col, count, children,
}: {
  col: typeof KANBAN_COLS[number]
  count: number
  children: React.ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: col.status })
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-xl ${col.color} p-3 transition-all duration-150 ${
        isOver ? `ring-2 ${col.ring}` : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
        <span className="text-xs bg-background border border-border rounded-full px-2 py-0.5 text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="space-y-2 min-h-[60px]">
        {children}
      </div>
    </div>
  )
}

export default function RepairsPage(): JSX.Element {
  return (
    <FeatureGate feature="job_cards.view">
      <RepairsPageInner />
    </FeatureGate>
  )
}

function RepairsPageInner(): JSX.Element {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobSection: 'active' | 'archived' = pathname.endsWith('/archived') ? 'archived' : 'active'
  const { t } = useTranslation()
  const canEdit   = usePermission('repairs.edit')
  const canDelete = usePermission('repairs.delete')
  const canStatus = usePermission('repairs.updateStatus')
  const role = useAuthStore(s => s.user?.role)
  const isOwner = role === 'owner'
  const canManageArchive = canEdit || isOwner
  const canManageStatus = canStatus || isOwner

  const [view, setView]               = useState<'kanban' | 'list'>('kanban')
  const [repairs, setRepairs]         = useState<RepairRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter]   = useState<'' | 'mechanical' | 'programming' | 'both'>('')
  const [techFilter, setTechFilter]   = useState('')
  const [bayFilter, setBayFilter]     = useState('')
  const [profileFilter, setProfileFilter] = useState<'' | 'incomplete' | 'complete'>('')
  const [chooserOpen, setChooserOpen] = useState(false)
  const [quickOpen, setQuickOpen]     = useState(false)
  const [fullCreateFromChooser, setFullCreateFromChooser] = useState(false)
  const [formOpen, setFormOpen]       = useState(false)
  const [editId, setEditId]           = useState<number | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<RepairRow | null>(null)
  const [activeRepair, setActiveRepair] = useState<RepairRow | null>(null)
  const [detailJobId, setDetailJobId] = useState<number | null>(null)
  const [invoiceJobId, setInvoiceJobId] = useState<number | null>(null)
  /** Bumps when the invoice wizard closes so AddJobModal reloads linked invoice / warranties. */
  const [invoiceWizardTick, setInvoiceWizardTick] = useState(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const profileParam = profileFilter === 'incomplete' ? 'incomplete' : profileFilter === 'complete' ? 'complete' : 'all'

  /** Archived route always uses list UI; active jobs use stored view (board vs list). */
  const showKanban = jobSection === 'active' && view === 'kanban'
  const showListLayout = jobSection === 'archived' || view === 'list'

  const load = async () => {
    setLoading(true)
    if (view === 'kanban' && jobSection === 'active') {
      const res = await window.electronAPI.jobCards.getByStatus({ profile: profileParam })
      if (res.success) {
        const rows = (res.data as RepairRow[]).map(r => ({ ...r, status: normalizeRepairStatus(r.status) }))
        setRepairs(rows)
      }
    } else {
      const res = await window.electronAPI.jobCards.list({
        search,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        profile: profileParam === 'all' ? undefined : profileParam,
        pageSize: 200,
        includeArchived: true,
      })
      if (res.success) {
        const rows = (res.data as { rows: RepairRow[] }).rows
          .map(r => ({ ...r, status: normalizeRepairStatus(r.status) }))
        setRepairs(rows.filter(r => (jobSection === 'archived' ? r.archived === 1 : r.archived !== 1)))
      }
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [view, search, statusFilter, deptFilter, profileFilter, jobSection])

  /** Per-user default: board vs list (active jobs only). */
  useEffect(() => {
    if (jobSection !== 'active') return
    let cancelled = false
    void (async () => {
      const res = await window.electronAPI.users.getMyPreferences()
      if (cancelled || !res.success || !res.data) return
      const jv = (res.data as { jobCardsView?: string }).jobCardsView
      if (jv === 'list' || jv === 'kanban') setView(jv)
    })()
    return () => {
      cancelled = true
    }
  }, [jobSection])

  /** Top bar → Create new job: open chooser when landing with ?new=1 */
  useEffect(() => {
    if (jobSection !== 'active') return
    if (searchParams.get('new') !== '1') return
    if (canEdit) setChooserOpen(true)
    setSearchParams(
      p => {
        const next = new URLSearchParams(p)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [jobSection, searchParams, setSearchParams, canEdit])

  /**
   * Customer profile → Job Cards: `?openJob=id` opens Edit Job Card (AddJobModal), same as clicking a job on the board.
   * Users without edit permission get the read-only detail drawer instead.
   */
  useEffect(() => {
    const raw = searchParams.get('openJob')
    if (raw == null || raw === '') return
    const id = Number.parseInt(raw, 10)
    if (!Number.isFinite(id) || id < 1) {
      setSearchParams(p => {
        const next = new URLSearchParams(p)
        next.delete('openJob')
        return next
      }, { replace: true })
      return
    }
    if (canEdit) {
      setFullCreateFromChooser(false)
      setEditId(id)
      setFormOpen(true)
    } else {
      setDetailJobId(id)
    }
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      next.delete('openJob')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams, canEdit])

  const handleDragStart = (event: DragStartEvent) => {
    const repair = repairs.find(r => r.id === Number(event.active.id))
    setActiveRepair(repair ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveRepair(null)
    if (!over || !canStatus) return

    const repairId = Number(active.id)

    // over.id is either a column status string or a card id (number)
    let newStatus: string
    const overId = over.id
    if (typeof overId === 'string' && KANBAN_COLS.find(c => c.status === overId)) {
      newStatus = overId
    } else {
      const targetCard = repairs.find(r => r.id === Number(overId))
      if (!targetCard) return
      newStatus = targetCard.status
    }

    const repair = repairs.find(r => r.id === repairId)
    if (!repair || repair.status === newStatus) return

    // Optimistic update
    setRepairs(prev => prev.map(r => r.id === repairId ? { ...r, status: newStatus } : r))

    const res = await window.electronAPI.jobCards.updateStatus(repairId, newStatus)
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      void load()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.jobCards.delete(deleteTarget.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteTarget(null)
    void load()
  }

  const openEdit = (id: number) => {
    setFullCreateFromChooser(false)
    setEditId(id)
    setFormOpen(true)
  }

  const handleArchiveToggle = async (repair: RepairRow, archived: boolean) => {
    const res = await window.electronAPI.jobCards.update(repair.id, { archived: archived ? 1 : 0 })
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      return
    }
    const hint = jobCardToastHint(repair)
    if (archived) {
      toast.success(t('jobCards.toastJobArchived', { jobNumber: repair.job_number, hint }))
    } else {
      toast.success(t('jobCards.toastJobRestored', { jobNumber: repair.job_number, hint }))
    }
    void load()
  }

  const canArchiveFromList = (repair: RepairRow) =>
    canManageArchive &&
    !repair.archived &&
    ['completed_delivered', 'delivered', 'cancelled'].includes(repair.status)

  const canCompleteFromList = (repair: RepairRow) =>
    canManageStatus &&
    !repair.archived &&
    !['completed_delivered', 'delivered', 'cancelled'].includes(repair.status)

  const handleCompleteFromList = async (repair: RepairRow) => {
    const res = await window.electronAPI.jobCards.updateStatus(repair.id, 'completed_delivered')
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      return
    }
    toast.success('Job marked as complete')
    void load()
  }

  const technicians = Array.from(new Set(repairs.filter(r => r.technician_name).map(r => r.technician_name as string)))
  const activeBays  = Array.from(new Set(repairs.filter(r => r.bay_number).map(r => r.bay_number as string)))

  const filtered = repairs.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      const hit = (s: string | null | undefined) => (s?.toLowerCase().includes(q) ?? false)
      if (!(
        hit(r.job_number) ||
        hit(r.owner_name) ||
        hit(r.owner_phone) ||
        hit(r.vehicle_plate) ||
        hit(r.vehicle_make) ||
        hit(r.vehicle_model) ||
        hit(r.vehicle_vin) ||
        hit(r.job_invoice_number) ||
        hit(r.complaint)
      )) return false
    }
    if (techFilter && r.technician_name !== techFilter) return false
    if (bayFilter && r.bay_number !== bayFilter) return false
    const raw = r.department ?? 'mechanical'
    if (deptFilter === 'mechanical' && raw !== 'mechanical' && raw !== 'both') return false
    if (deptFilter === 'programming' && raw !== 'programming' && raw !== 'both') return false
    if (deptFilter === 'both' && raw !== 'both') return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {jobSection === 'archived' ? t('nav.archivedJobs') : t('nav.jobCards')}
        </h1>
        <div className="flex items-center gap-2">
          {jobSection === 'active' && (
            <button
              type="button"
              onClick={() => {
                const next = view === 'kanban' ? 'list' : 'kanban'
                setView(next)
                void window.electronAPI.users.updateMyPreferences({ jobCardsView: next })
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
            >
              {view === 'kanban' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              {view === 'kanban' ? 'List View' : 'Board View'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { setChooserOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />New Job
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {showListLayout && (
          <SearchInput value={search} onChange={setSearch} placeholder={t('repairs.listSearchPlaceholder')} className="max-w-xs" />
        )}
        {showListLayout && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Statuses</option>
            {ALL_STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        )}
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value as '' | 'mechanical' | 'programming' | 'both')}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Departments</option>
          <option value="mechanical">Mechanical (incl. Both)</option>
          <option value="programming">Programming (incl. Both)</option>
          <option value="both">Both only</option>
        </select>
        <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Technicians</option>
          {technicians.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={bayFilter} onChange={e => setBayFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Bays</option>
          {BAYS.filter(b => activeBays.includes(b) || true).map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={profileFilter}
          onChange={e => setProfileFilter(e.target.value as '' | 'incomplete' | 'complete')}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All jobs</option>
          <option value="incomplete">Draft (quick intake)</option>
          <option value="complete">Profile complete</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : showKanban ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={event => void handleDragEnd(event)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLS.map(col => {
              const colRepairs = filtered.filter(r => r.status === (col.status as string))
              return (
                <DroppableColumn key={col.status} col={col} count={colRepairs.length}>
                  <SortableContext items={colRepairs.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {colRepairs.map(r => (
                      <RepairCard
                        key={r.id}
                        repair={r}
                        onClick={() => openEdit(r.id)}
                        onOpenDetails={() => setDetailJobId(r.id)}
                      />
                    ))}
                  </SortableContext>
                </DroppableColumn>
              )
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeRepair && (
              <div className="opacity-80 rotate-1 shadow-xl">
                <RepairCard repair={activeRepair} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="bg-card border border-border rounded-lg min-w-0">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain min-w-0">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Job #</th>
                  <th className="text-start px-4 py-3 font-medium">Vehicle</th>
                  <th className="text-start px-4 py-3 font-medium">{t('jobCards.owner')}</th>
                  <th className="text-start px-4 py-3 font-medium">Type</th>
                  <th className="text-start px-4 py-3 font-medium">Invoice</th>
                  <th className="text-center px-4 py-3 font-medium">Dept</th>
                  <th className="text-center px-4 py-3 font-medium">Priority</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-start px-4 py-3 font-medium">Technician</th>
                  <th className="text-start px-4 py-3 font-medium">Bay</th>
                  <th className="text-start px-4 py-3 font-medium">Date In</th>
                  <th className="text-start px-4 py-3 font-medium">Expected</th>
                  <th className="text-end px-4 py-3 font-medium">Total</th>
                  <th className="text-end px-4 py-3 font-medium">Balance</th>
                  <th className="text-end px-3 py-3 font-medium sticky right-0 z-20 bg-muted/80 backdrop-blur-sm border-l border-border shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.12)] min-w-[10.5rem]">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => {
                  const vehicle = [r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ')
                  const deptKey = r.department ?? 'mechanical'
                  return (
                    <tr key={r.id} className="group hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {r.job_number}
                          {r.archived === 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold uppercase">
                              Archived
                            </span>
                          )}
                          {r.profile_complete === 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-semibold uppercase">
                              Draft
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">{vehicle || '—'}{r.vehicle_plate ? ` (${r.vehicle_plate})` : ''}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.owner_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.job_type}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.job_invoice_number ? (
                          <span className="text-emerald-700 dark:text-emerald-400">{r.job_invoice_number}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DEPT_LIST_BADGE[deptKey] ?? DEPT_LIST_BADGE.mechanical}`}>
                          {listDeptLabel(deptKey)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[r.priority] ?? 'bg-muted text-muted-foreground'}`}>
                          {r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.technician_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.bay_number ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.expected_completion ? formatDate(r.expected_completion) : '—'}</td>
                      <td className="px-4 py-3 text-end font-medium"><CurrencyText amount={r.total} /></td>
                      <td className="px-4 py-3 text-end">
                        {r.balance_due > 0 ? (
                          <span className="text-destructive font-medium"><CurrencyText amount={r.balance_due} className="text-destructive" /></span>
                        ) : (
                          <span className="text-green-600 text-xs">Paid</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-end sticky right-0 z-10 border-l border-border bg-card group-hover:bg-muted/30 min-w-[10.5rem] shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)]">
                        <div className="flex items-center justify-end gap-1 flex-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailJobId(r.id)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                            title="Job details & invoice"
                            aria-label="Job details"
                          >
                            <PanelRight className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button onClick={() => openEdit(r.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-xs shrink-0">
                              Del
                            </button>
                          )}
                          {canCompleteFromList(r) && (
                            <button
                              type="button"
                              onClick={() => void handleCompleteFromList(r)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-emerald-600 shrink-0"
                              title="Mark complete"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(canArchiveFromList(r) || (canManageArchive && r.archived === 1)) && (
                            <button
                              type="button"
                              onClick={() => void handleArchiveToggle(r, r.archived !== 1)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                              title={r.archived === 1 ? 'Restore job' : 'Archive job'}
                            >
                              {r.archived === 1 ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      <JobCreationChooserModal
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onQuick={() => {
          setChooserOpen(false)
          setQuickOpen(true)
        }}
        onFull={() => {
          setChooserOpen(false)
          setEditId(undefined)
          setFormOpen(true)
          setFullCreateFromChooser(true)
        }}
      />

      <QuickCreateJobModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onBack={() => {
          setQuickOpen(false)
          setChooserOpen(true)
        }}
        onCreated={() => {
          void load()
        }}
      />

      <AddJobModal
        open={formOpen}
        repairId={editId}
        onOpenInvoiceWizard={id => setInvoiceJobId(id)}
        invoiceWizardRefreshKey={invoiceWizardTick}
        onClose={() => {
          setFormOpen(false)
          setEditId(undefined)
          setFullCreateFromChooser(false)
        }}
        onEntryBackToChooser={
          fullCreateFromChooser && editId == null
            ? () => {
                setFormOpen(false)
                setFullCreateFromChooser(false)
                setChooserOpen(true)
              }
            : undefined
        }
        onSaved={p => {
          void load()
          if (p.createdId != null) setEditId(p.createdId)
          if (p.close) {
            setFormOpen(false)
            setEditId(undefined)
            setFullCreateFromChooser(false)
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.delete')}
        message={`Delete job ${deleteTarget?.job_number}? This cannot be undone.`}
        confirmLabel={t('common.delete')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <JobDetailDrawer
        jobId={detailJobId}
        onClose={() => setDetailJobId(null)}
        onEdit={id => {
          setDetailJobId(null)
          openEdit(id)
        }}
        onGenerateInvoice={id => setInvoiceJobId(id)}
        onJobUpdated={() => void load()}
      />

      <JobInvoiceWizardModal
        open={invoiceJobId != null}
        jobId={invoiceJobId}
        onClose={() => {
          setInvoiceJobId(null)
          setInvoiceWizardTick(t => t + 1)
        }}
        onCreated={() => {
          void load()
          setInvoiceWizardTick(t => t + 1)
        }}
      />
    </div>
  )
}
