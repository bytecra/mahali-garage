import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, LayoutGrid, List, Pencil } from 'lucide-react'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import { formatCurrency, formatDate } from '../../lib/utils'
import RepairCard, { RepairRow } from './RepairCard'
import RepairForm from './RepairForm'
import { FeatureGate } from '../../components/FeatureGate'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import SearchInput from '../../components/shared/SearchInput'

const KANBAN_COLS: Array<{ status: string; label: string; color: string }> = [
  { status: 'pending',       label: 'Pending',           color: 'bg-slate-50 dark:bg-slate-950/30' },
  { status: 'in_progress',   label: 'In Progress',       color: 'bg-blue-50 dark:bg-blue-950/30' },
  { status: 'waiting_parts', label: 'Waiting for Parts', color: 'bg-yellow-50 dark:bg-yellow-950/30' },
  { status: 'ready',         label: 'Ready for Pickup',  color: 'bg-green-50 dark:bg-green-950/30' },
]

const STATUS_COLORS: Record<string, string> = {
  pending:       'bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-400',
  in_progress:   'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  waiting_parts: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  ready:         'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  delivered:     'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  cancelled:     'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
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

export default function RepairsPage(): JSX.Element {
  return (
    <FeatureGate feature="job_cards.view">
      <RepairsPageInner />
    </FeatureGate>
  )
}

function RepairsPageInner(): JSX.Element {
  const { t } = useTranslation()
  const canEdit   = usePermission('repairs.edit')
  const canDelete = usePermission('repairs.delete')
  const canStatus = usePermission('repairs.updateStatus')

  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [repairs, setRepairs] = useState<RepairRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState<'' | 'mechanical' | 'programming'>('')
  const [techFilter, setTechFilter] = useState('')
  const [bayFilter, setBayFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<RepairRow | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = async () => {
    setLoading(true)
    if (view === 'kanban') {
      const res = await window.electronAPI.jobCards.getByStatus()
      if (res.success) setRepairs(res.data as RepairRow[])
    } else {
      const res = await window.electronAPI.jobCards.list({
        search,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        pageSize: 100,
      })
      if (res.success) setRepairs((res.data as { rows: RepairRow[] }).rows)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [view, search, statusFilter, deptFilter])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !canStatus) return
    const repairId = Number(active.id)
    const newStatus = String(over.id)
    if (!KANBAN_COLS.find(c => c.status === newStatus)) return
    const repair = repairs.find(r => r.id === repairId)
    if (!repair || repair.status === newStatus) return
    const res = await window.electronAPI.jobCards.updateStatus(repairId, newStatus)
    if (res.success) { toast.success(t('common.success')); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.jobCards.delete(deleteTarget.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteTarget(null)
    load()
  }

  const openEdit = (id: number) => { setEditId(id); setFormOpen(true) }

  const technicians = Array.from(new Set(repairs.filter(r => r.technician_name).map(r => r.technician_name as string)))
  const activeBays = Array.from(new Set(repairs.filter(r => r.bay_number).map(r => r.bay_number as string)))

  const filtered = repairs.filter(r => {
    if (search && !(
      r.job_number.toLowerCase().includes(search.toLowerCase()) ||
      (r.complaint?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.owner_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.vehicle_make?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.vehicle_model?.toLowerCase().includes(search.toLowerCase()) ?? false)
    )) return false
    if (techFilter && r.technician_name !== techFilter) return false
    if (bayFilter && r.bay_number !== bayFilter) return false
    const d = r.department ?? 'mechanical'
    if (deptFilter === 'mechanical' && !['mechanical', 'both'].includes(d)) return false
    if (deptFilter === 'programming' && !['programming', 'both'].includes(d)) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Job Cards</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setView(v => v === 'kanban' ? 'list' : 'kanban')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
            {view === 'kanban' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            {view === 'kanban' ? 'List View' : 'Board View'}
          </button>
          {canEdit && (
            <button onClick={() => { setEditId(undefined); setFormOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              <Plus className="w-4 h-4" />New Job
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {view === 'list' && (
          <SearchInput value={search} onChange={setSearch} placeholder="Search jobs, vehicles, owners..." className="max-w-xs" />
        )}
        {view === 'list' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Statuses</option>
            {['pending','in_progress','waiting_parts','ready','delivered','cancelled'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>
        )}
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value as '' | 'mechanical' | 'programming')}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Departments</option>
          <option value="mechanical">Mechanical</option>
          <option value="programming">Programming</option>
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
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLS.map(col => {
              const colRepairs = filtered.filter(r => r.status === col.status)
              return (
                <div key={col.status} id={col.status} className={`flex-shrink-0 w-72 rounded-xl ${col.color} p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
                    <span className="text-xs bg-background border border-border rounded-full px-2 py-0.5 text-muted-foreground">{colRepairs.length}</span>
                  </div>
                  <SortableContext items={colRepairs.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 min-h-[60px]">
                      {colRepairs.map(r => (
                        <RepairCard key={r.id} repair={r} onClick={() => openEdit(r.id)} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              )
            })}
          </div>
        </DndContext>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Job #</th>
                  <th className="text-start px-4 py-3 font-medium">Vehicle</th>
                  <th className="text-start px-4 py-3 font-medium">Owner</th>
                  <th className="text-start px-4 py-3 font-medium">Type</th>
                  <th className="text-center px-4 py-3 font-medium">Dept</th>
                  <th className="text-center px-4 py-3 font-medium">Priority</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-start px-4 py-3 font-medium">Technician</th>
                  <th className="text-start px-4 py-3 font-medium">Bay</th>
                  <th className="text-start px-4 py-3 font-medium">Date In</th>
                  <th className="text-start px-4 py-3 font-medium">Expected</th>
                  <th className="text-end px-4 py-3 font-medium">Total</th>
                  <th className="text-end px-4 py-3 font-medium">Balance</th>
                  <th className="text-end px-4 py-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(r => {
                  const vehicle = [r.vehicle_make, r.vehicle_model, r.vehicle_year].filter(Boolean).join(' ')
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{r.job_number}</td>
                      <td className="px-4 py-3">{vehicle || '—'}{r.vehicle_plate ? ` (${r.vehicle_plate})` : ''}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.owner_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.job_type}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DEPT_LIST_BADGE[r.department ?? 'mechanical'] ?? DEPT_LIST_BADGE.mechanical}`}>
                          {listDeptLabel(r.department)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[r.priority] ?? 'bg-muted text-muted-foreground'}`}>
                          {r.priority.charAt(0).toUpperCase() + r.priority.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {r.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.technician_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.bay_number ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.expected_completion ? formatDate(r.expected_completion) : '—'}</td>
                      <td className="px-4 py-3 text-end font-medium">{formatCurrency(r.total)}</td>
                      <td className="px-4 py-3 text-end">
                        {r.balance_due > 0 ? (
                          <span className="text-destructive font-medium">{formatCurrency(r.balance_due)}</span>
                        ) : (
                          <span className="text-green-600 text-xs">Paid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(r.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-xs">
                              Del
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <RepairForm open={formOpen} repairId={editId} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} />
      <ConfirmDialog open={!!deleteTarget} title={t('common.delete')}
        message={`Delete job ${deleteTarget?.job_number}? This cannot be undone.`}
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}
