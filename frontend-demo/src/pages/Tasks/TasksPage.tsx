import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, LayoutGrid, List, Pencil, Trash2, AlertCircle, Clock,
  CheckCircle2, CalendarDays, Flag, User2, RotateCcw,
} from 'lucide-react'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  useDroppable, DragOverlay, useDraggable,
} from '@dnd-kit/core'
import { format, isPast, isToday, parseISO } from 'date-fns'
import { usePermission, useAnyPermission } from '../../hooks/usePermission'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import SearchInput from '../../components/shared/SearchInput'
import EmptyState from '../../components/shared/EmptyState'
import { FeatureGate } from '../../components/FeatureGate'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaskRow {
  id: number
  title: string
  description: string | null
  task_type: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'done' | 'cancelled'
  start_datetime: string | null
  end_datetime: string | null
  due_date: string | null
  branch: string | null
  module: string | null
  module_id: number | null
  sale_id: number | null
  is_recurring: number
  recurrence_type: string | null
  recurrence_interval: number
  recurrence_end_date: string | null
  created_by: number | null
  created_by_name: string | null
  assignee_names: string | null
  assignee_ids: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface UserOption { id: number; full_name: string; role: string }

// ── Constants ─────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = {
  high:   'border-s-4 border-s-red-500',
  medium: 'border-s-4 border-s-amber-500',
  low:    'border-s-4 border-s-slate-300',
}
const PRIORITY_BADGE = {
  high:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  low:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const STATUS_BADGE: Record<string, string> = {
  pending:     'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  done:        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  cancelled:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}
const TYPE_ICON: Record<string, string> = {
  task:        '✓',
  delivery:    '🚚',
  appointment: '📅',
  reminder:    '🔔',
}
const BOARD_COLS = [
  { status: 'pending',     label: 'Pending',     color: 'bg-blue-50 dark:bg-blue-950/20' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-orange-50 dark:bg-orange-950/20' },
  { status: 'done',        label: 'Done',        color: 'bg-green-50 dark:bg-green-950/20' },
  { status: 'cancelled',   label: 'Cancelled',   color: 'bg-red-50 dark:bg-red-950/20' },
]

// ── Schema ────────────────────────────────────────────────────────────────────
const taskSchema = z.object({
  title:               z.string().min(1, 'Title is required'),
  description:         z.string().optional(),
  task_type:           z.enum(['task','delivery','appointment','reminder']),
  priority:            z.enum(['high','medium','low']),
  status:              z.enum(['pending','in_progress','done','cancelled']),
  start_datetime:      z.string().optional(),
  end_datetime:        z.string().optional(),
  due_date:            z.string().optional(),
  branch:              z.string().optional(),
  module:              z.enum(['inventory','expenses','repairs','sales','']).optional(),
  is_recurring:        z.boolean(),
  recurrence_type:     z.enum(['daily','weekly','monthly','yearly','']).optional(),
  recurrence_interval: z.number().min(1).max(365),
  recurrence_end_date: z.string().optional(),
  assignee_ids:        z.array(z.number()).optional(),
  notes:               z.string().optional(),
})
type TaskFormValues = z.infer<typeof taskSchema>

const defaultValues: TaskFormValues = {
  title: '', description: '', task_type: 'task', priority: 'medium',
  status: 'pending', start_datetime: '', end_datetime: '', due_date: '',
  branch: '', module: '', is_recurring: false, recurrence_type: '',
  recurrence_interval: 1, recurrence_end_date: '', assignee_ids: [], notes: '',
}

// ── Droppable column (Board) ──────────────────────────────────────────────────
function DroppableColumn({ status, color, label, children }: {
  status: string; color: string; label: string; children: React.ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[200px] rounded-xl p-3 ${color} ${isOver ? 'ring-2 ring-primary/50' : ''} transition-all`}
    >
      <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">{label}</h3>
      <div className="space-y-2 min-h-[80px]">{children}</div>
    </div>
  )
}

// ── Draggable task card (Board) ───────────────────────────────────────────────
function DraggableTaskCard({ task, onEdit, onDelete, canEdit, canDelete }: {
  task: TaskRow; onEdit: (t: TaskRow) => void; onDelete: (t: TaskRow) => void
  canEdit: boolean; canDelete: boolean
}): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'done'
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing
        ${PRIORITY_COLORS[task.priority]} ${isDragging ? 'opacity-50' : ''}
        ${isOverdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {TYPE_ICON[task.task_type] || '✓'} {task.title}
          </p>
          {task.due_date && (
            <p className={`text-xs mt-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
              {isOverdue ? '⚠ ' : ''}{format(parseISO(task.due_date), 'MMM d')}
            </p>
          )}
          {task.assignee_names && (
            <p className="text-xs text-muted-foreground mt-1 truncate">👤 {task.assignee_names}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0" onPointerDown={e => e.stopPropagation()}>
          {canEdit && (
            <button onClick={() => onEdit(task)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(task)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <span className={`inline-block mt-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[task.priority]}`}>
        {task.priority}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TasksPage(): JSX.Element {
  return (
    <FeatureGate feature="tasks.view">
      <TasksPageInner />
    </FeatureGate>
  )
}

function TasksPageInner(): JSX.Element {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const userId = user?.userId
  const role = user?.role
  const isPrivileged = ['owner', 'manager'].includes(role ?? '')
  const canCreate = usePermission('tasks.create')
  const canEdit   = useAnyPermission(['tasks.edit'])
  const canDelete = usePermission('tasks.delete')
  const canAssign = usePermission('tasks.assign')

  const [view, setView]         = useState<'list' | 'board'>('list')
  const [tasks, setTasks]       = useState<TaskRow[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus]   = useState('all')
  const [priorityFilter, setPriority] = useState('all')
  const [typeFilter, setType]   = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editTask, setEditTask] = useState<TaskRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null)
  const [users, setUsers]       = useState<UserOption[]>([])
  const [draggingTask, setDraggingTask] = useState<TaskRow | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const form = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.tasks.list({
      search, status: statusFilter, priority: priorityFilter, task_type: typeFilter,
      page: 1, pageSize: 100,
    })
    if (res.success) {
      setTasks((res.data as { rows: TaskRow[]; total: number }).rows)
      setTotal((res.data as { rows: TaskRow[]; total: number }).total)
    }
    setLoading(false)
  }, [search, statusFilter, priorityFilter, typeFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!isPrivileged) return
    window.electronAPI.users.list().then(res => {
      if (res.success) setUsers((res.data as { rows: UserOption[] }).rows)
    })
  }, [isPrivileged])

  const openCreate = () => {
    setEditTask(null)
    form.reset(defaultValues)
    setFormOpen(true)
  }

  const openEdit = (task: TaskRow) => {
    setEditTask(task)
    form.reset({
      title: task.title,
      description: task.description ?? '',
      task_type: task.task_type as TaskFormValues['task_type'],
      priority: task.priority,
      status: task.status,
      start_datetime: task.start_datetime?.slice(0, 16) ?? '',
      end_datetime: task.end_datetime?.slice(0, 16) ?? '',
      due_date: task.due_date ?? '',
      branch: task.branch ?? '',
      module: (task.module ?? '') as TaskFormValues['module'],
      is_recurring: !!task.is_recurring,
      recurrence_type: (task.recurrence_type ?? '') as TaskFormValues['recurrence_type'],
      recurrence_interval: task.recurrence_interval ?? 1,
      recurrence_end_date: task.recurrence_end_date ?? '',
      assignee_ids: task.assignee_ids ? task.assignee_ids.split(',').map(Number).filter(Boolean) : [],
      notes: task.notes ?? '',
    })
    setFormOpen(true)
  }

  const onSubmit = async (values: TaskFormValues) => {
    const payload = {
      ...values,
      module: values.module || null,
      branch: values.branch || null,
      start_datetime: values.start_datetime || null,
      end_datetime: values.end_datetime || null,
      due_date: values.due_date || null,
      recurrence_type: values.is_recurring ? (values.recurrence_type || null) : null,
      is_recurring: values.is_recurring ? 1 : 0,
      recurrence_end_date: values.recurrence_end_date || null,
    }
    if (editTask) {
      const res = await window.electronAPI.tasks.update(editTask.id, payload)
      if (res.success) { toast.success(t('common.success')); setFormOpen(false); load() }
      else toast.error(res.error ?? t('common.error'))
    } else {
      const res = await window.electronAPI.tasks.create(payload)
      if (res.success) { toast.success(t('common.success')); setFormOpen(false); load() }
      else toast.error(res.error ?? t('common.error'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.tasks.delete(deleteTarget.id)
    if (res.success) { toast.success(t('common.success')); setDeleteTarget(null); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setDraggingTask(null)
    if (!over || !canEdit) return
    const taskId = Number(active.id)
    const newStatus = String(over.id)
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    const res = await window.electronAPI.tasks.update(taskId, { status: newStatus })
    if (res.success) load()
    else toast.error(res.error ?? t('common.error'))
  }

  const isWatching = form.watch('is_recurring')
  const isToday_ = (date: string) => date && isToday(parseISO(date))
  const isOverdue = (t: TaskRow) =>
    t.due_date && isPast(parseISO(t.due_date)) && !['done','cancelled'].includes(t.status)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('tasks.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} {t('tasks.records')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`p-2 rounded-md transition-colors ${view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('board')}
            className={`p-2 rounded-md transition-colors ${view === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('tasks.addTask')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder={t('tasks.searchPlaceholder')} className="w-64" />
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground">
          <option value="all">{t('common.all')} {t('common.status')}</option>
          <option value="pending">{t('tasks.status.pending')}</option>
          <option value="in_progress">{t('tasks.status.in_progress')}</option>
          <option value="done">{t('tasks.status.done')}</option>
          <option value="cancelled">{t('tasks.status.cancelled')}</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriority(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground">
          <option value="all">{t('common.all')} {t('repairs.priority')}</option>
          <option value="high">{t('tasks.priority.high')}</option>
          <option value="medium">{t('tasks.priority.medium')}</option>
          <option value="low">{t('tasks.priority.low')}</option>
        </select>
        <select value={typeFilter} onChange={e => setType(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground">
          <option value="all">{t('common.all')} {t('tasks.type')}</option>
          <option value="task">{t('tasks.taskType.task')}</option>
          <option value="delivery">{t('tasks.taskType.delivery')}</option>
          <option value="appointment">{t('tasks.taskType.appointment')}</option>
          <option value="reminder">{t('tasks.taskType.reminder')}</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">{t('common.loading')}</div>
      ) : tasks.length === 0 ? (
        <EmptyState title={t('tasks.noTasks')} description={canCreate ? t('tasks.noTasksDesc') : ''} />
      ) : view === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-start px-4 py-3 font-medium text-muted-foreground w-8"></th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('tasks.type')}</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('repairs.priority')}</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('tasks.dueDate')}</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('tasks.assignees')}</th>
                {(canEdit || canDelete) && (
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const overdue = isOverdue(task)
                const today = isToday_(task.due_date ?? '')
                return (
                  <tr
                    key={task.id}
                    className={`border-b border-border/50 last:border-0 transition-colors
                      ${overdue ? 'bg-red-50/40 dark:bg-red-950/10' : today ? 'bg-amber-50/40 dark:bg-amber-950/10' : 'hover:bg-muted/30'}`}
                  >
                    <td className="px-4 py-3">
                      <div className={`w-1 h-8 rounded-full ${
                        task.priority === 'high' ? 'bg-red-500' :
                        task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                      }`} />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{task.description}</p>}
                        {task.branch && <p className="text-xs text-muted-foreground">{task.branch}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg" title={task.task_type}>{TYPE_ICON[task.task_type] || '✓'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}>
                        <Flag className="w-2.5 h-2.5" />
                        {t(`tasks.priority.${task.priority}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[task.status]}`}>
                        {t(`tasks.status.${task.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {task.due_date ? (
                        <span className={`flex items-center gap-1 text-xs
                          ${overdue ? 'text-red-500 font-semibold' : today ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                          {overdue && <AlertCircle className="w-3 h-3" />}
                          {today && <Clock className="w-3 h-3" />}
                          {format(parseISO(task.due_date), 'MMM d, yyyy')}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {task.assignee_names
                        ? <span className="text-xs text-muted-foreground flex items-center gap-1"><User2 className="w-3 h-3" />{task.assignee_names}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(task)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(task)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── BOARD VIEW ── */
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}
          onDragStart={e => setDraggingTask(tasks.find(t => t.id === Number(e.active.id)) ?? null)}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_COLS.map(col => (
              <DroppableColumn key={col.status} status={col.status} color={col.color} label={t(`tasks.status.${col.status}`)}>
                {tasks.filter(t => t.status === col.status).map(task => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                ))}
              </DroppableColumn>
            ))}
          </div>
          <DragOverlay>
            {draggingTask && (
              <div className={`bg-card border border-border rounded-lg p-3 shadow-xl opacity-90 ${PRIORITY_COLORS[draggingTask.priority]}`}>
                <p className="text-sm font-medium">{draggingTask.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── TASK FORM MODAL ── */}
      <Modal
        open={formOpen}
        title={editTask ? t('tasks.editTask') : t('tasks.addTask')}
        onClose={() => setFormOpen(false)}
        size="xl"
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
            <button onClick={form.handleSubmit(onSubmit)} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">{t('common.save')}</button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={e => e.preventDefault()}>
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('tasks.taskTitle')} *</label>
            <input {...form.register('title')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
            {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
          </div>

          {/* Type + Priority + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('tasks.type')}</label>
              <select {...form.register('task_type')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                <option value="task">{t('tasks.taskType.task')}</option>
                <option value="delivery">{t('tasks.taskType.delivery')}</option>
                <option value="appointment">{t('tasks.taskType.appointment')}</option>
                <option value="reminder">{t('tasks.taskType.reminder')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('repairs.priority')}</label>
              <select {...form.register('priority')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                <option value="high">{t('tasks.priority.high')}</option>
                <option value="medium">{t('tasks.priority.medium')}</option>
                <option value="low">{t('tasks.priority.low')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('common.status')}</label>
              <select {...form.register('status')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                <option value="pending">{t('tasks.status.pending')}</option>
                <option value="in_progress">{t('tasks.status.in_progress')}</option>
                <option value="done">{t('tasks.status.done')}</option>
                <option value="cancelled">{t('tasks.status.cancelled')}</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
            <textarea {...form.register('description')} rows={2} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('tasks.startDate')}</label>
              <input type="datetime-local" {...form.register('start_datetime')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('tasks.endDate')}</label>
              <input type="datetime-local" {...form.register('end_datetime')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('tasks.dueDate')}</label>
              <input type="date" {...form.register('due_date')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
            </div>
          </div>

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('expenses.branch')}</label>
            <input {...form.register('branch')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" placeholder={t('expenses.branchPlaceholder')} />
          </div>

          {/* Recurring */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" {...form.register('is_recurring')} id="is_recurring" className="w-4 h-4 rounded" />
              <label htmlFor="is_recurring" className="text-sm font-medium cursor-pointer flex items-center gap-1">
                <RotateCcw className="w-4 h-4" /> {t('tasks.recurring')}
              </label>
            </div>
            {isWatching && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('tasks.recurrenceFrequency')}</label>
                  <select {...form.register('recurrence_type')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                    <option value="daily">{t('tasks.recurrence.daily')}</option>
                    <option value="weekly">{t('tasks.recurrence.weekly')}</option>
                    <option value="monthly">{t('tasks.recurrence.monthly')}</option>
                    <option value="yearly">{t('tasks.recurrence.yearly')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('tasks.recurrenceInterval')}</label>
                  <input type="number" min={1} max={365} {...form.register('recurrence_interval', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('tasks.recurrenceEndDate')}</label>
                  <input type="date" {...form.register('recurrence_end_date')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Assignees (privileged only) */}
          {canAssign && users.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">{t('tasks.assignTo')}</label>
              <div className="flex flex-wrap gap-2 border border-border rounded-lg p-3 max-h-32 overflow-y-auto">
                {users.map(u => {
                  const currentIds = form.watch('assignee_ids') ?? []
                  const checked = currentIds.includes(u.id)
                  return (
                    <label key={u.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border transition-colors
                      ${checked ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-border hover:bg-muted'}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={e => {
                          const ids = form.getValues('assignee_ids') ?? []
                          form.setValue('assignee_ids', e.target.checked ? [...ids, u.id] : ids.filter(id => id !== u.id))
                        }}
                      />
                      {u.full_name}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <textarea {...form.register('notes')} rows={2} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none" />
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('tasks.deleteConfirm')}
        message={t('tasks.deleteConfirmMessage')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
