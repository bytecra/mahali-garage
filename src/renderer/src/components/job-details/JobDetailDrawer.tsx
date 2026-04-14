import { useEffect, useState } from 'react'
import {
  ArrowLeft, Pencil, FileText, Loader2, Archive, ArchiveRestore, CheckCircle2,
} from 'lucide-react'
import { formatDate, formatCurrency } from '../../lib/utils'
import CurrencyText from '../shared/CurrencyText'
import ProgressTab from '../modals/job-tabs/ProgressTab'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import { useAuthStore } from '../../store/authStore'

type PartRow = {
  id: number
  description: string | null
  quantity: number
  unit_price: number
  total: number
  line_department?: string | null
}

type JobDetail = {
  id: number
  job_number: string
  status: string
  archived?: number | null
  profile_complete?: number | null
  owner_id: number | null
  vehicle_id: number | null
  owner_name?: string | null
  vehicle_make?: string | null
  vehicle_model?: string | null
  vehicle_year?: number | null
  vehicle_plate?: string | null
  created_at: string
  total: number
  parts?: PartRow[]
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    waiting_parts: 'Waiting for Parts',
    waiting_for_programming: 'Waiting for Programming',
    ready: 'Ready for Pickup',
    completed_delivered: 'Completed / Delivered',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return map[s] ?? s.replace(/_/g, ' ')
}

const ARCHIVABLE_STATUSES = new Set(['completed_delivered', 'delivered', 'cancelled'])

export default function JobDetailDrawer(props: {
  jobId: number | null
  onClose: () => void
  onEdit: (id: number) => void
  onGenerateInvoice: (id: number) => void
  /** Called after archive / restore so the list can refresh. */
  onJobUpdated?: () => void
}): JSX.Element | null {
  const { jobId, onClose, onEdit, onGenerateInvoice, onJobUpdated } = props
  const canEdit = usePermission('repairs.edit')
  const canStatus = usePermission('repairs.updateStatus')
  const role = useAuthStore(s => s.user?.role)
  const isOwner = role === 'owner'
  const canManageArchive = canEdit || isOwner
  const canManageStatus = canStatus || isOwner
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (jobId == null) {
      setJob(null)
      return
    }
    setLoading(true)
    void window.electronAPI.jobCards.getById(jobId).then(res => {
      if (res.success && res.data) setJob(res.data as JobDetail)
      else setJob(null)
      setLoading(false)
    })
  }, [jobId])

  if (jobId == null) return null

  const parts = job?.parts ?? []
  const partsTotal = parts.reduce((s, p) => s + (p.total ?? p.quantity * p.unit_price), 0)
  const isArchived = job?.archived === 1
  const canArchive =
    !!job && canManageArchive && !isArchived && ARCHIVABLE_STATUSES.has(job.status)
  const canRestore = !!job && canManageArchive && isArchived
  const canComplete =
    !!job && canManageStatus && !isArchived && !ARCHIVABLE_STATUSES.has(job.status)

  const canInvoice =
    !!job &&
    !isArchived &&
    job.owner_id != null &&
    job.vehicle_id != null &&
    parts.length > 0 &&
    parts.every(p => (p.description ?? '').trim().length >= 1 && p.unit_price > 0)

  let invoiceDisabledReason = ''
  if (isArchived) invoiceDisabledReason = 'Archived job'
  else if (!job?.owner_id) invoiceDisabledReason = 'Customer required'
  else if (!job?.vehicle_id) invoiceDisabledReason = 'Vehicle required'
  else if (parts.length === 0) invoiceDisabledReason = 'Add job items first'
  else if (!parts.every(p => p.unit_price > 0)) invoiceDisabledReason = 'Invalid prices on items'

  const handleArchive = async (archived: boolean): Promise<void> => {
    if (!job) return
    setArchiving(true)
    try {
      const res = await window.electronAPI.jobCards.update(job.id, { archived: archived ? 1 : 0 })
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? 'Could not update job')
        return
      }
      toast.success(archived ? 'Job archived' : 'Job restored to the board')
      onJobUpdated?.()
      setJob({ ...job, archived: archived ? 1 : 0 })
    } catch {
      toast.error('Could not update job')
    } finally {
      setArchiving(false)
    }
  }

  const handleComplete = async (): Promise<void> => {
    if (!job) return
    setArchiving(true)
    try {
      const res = await window.electronAPI.jobCards.updateStatus(job.id, 'completed_delivered')
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? 'Could not complete job')
        return
      }
      toast.success('Job marked as complete')
      onJobUpdated?.()
      setJob({ ...job, status: 'completed_delivered' })
    } catch {
      toast.error('Could not complete job')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-labelledby="job-detail-title"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 id="job-detail-title" className="font-semibold text-lg truncate flex-1">
            {loading ? '…' : job?.job_number ?? 'Job'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
          {loading && (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
          {!loading && job && (
            <>
              {isArchived && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  This job is archived and is hidden from the job board and list unless you turn on “Show archived”.
                </div>
              )}
              {job.profile_complete === 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                  Quick intake — add line items and full details in Edit job when you are ready.
                </div>
              )}
              <div className="space-y-1">
                <p>
                  <span className="text-muted-foreground">Customer:</span>{' '}
                  <span className="font-medium">{job.owner_name ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Vehicle:</span>{' '}
                  {[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ') || '—'}
                  {job.vehicle_plate ? ` (${job.vehicle_plate})` : ''}
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <span className="capitalize">{statusLabel(job.status)}</span>
                </p>
                <p className="text-xs text-muted-foreground">Created: {formatDate(job.created_at)}</p>
              </div>

              <div>
                <h3 className="font-medium mb-2">Job items</h3>
                {parts.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No line items yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {parts.map(p => {
                      const line = p.total ?? p.quantity * p.unit_price
                      return (
                        <li key={p.id} className="flex justify-between gap-2 text-xs border border-border rounded-md px-2 py-1.5">
                          <span className="truncate flex items-center gap-1.5 min-w-0">
                            {(p.description ?? 'Item').trim() || 'Item'}
                            <span
                              className={`shrink-0 text-[10px] uppercase font-semibold px-1 py-0 rounded ${
                                p.line_department === 'programming'
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {p.line_department === 'programming' ? 'Prog' : 'Mech'}
                            </span>
                          </span>
                          <span className="tabular-nums shrink-0 text-muted-foreground">
                            {formatCurrency(p.unit_price)} × {p.quantity} = <CurrencyText amount={line} />
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mt-2 text-end font-semibold">
                  Total: <CurrencyText amount={partsTotal || job.total} />
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">Progress</h3>
                <div className="border border-border rounded-lg p-2 max-h-[280px] overflow-y-auto">
                  <ProgressTab jobCardId={job.id} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border p-4 flex flex-col gap-2 shrink-0 bg-muted/20">
          <div className="flex flex-wrap gap-2 justify-end">
            {canEdit && job && (
              <button
                type="button"
                onClick={() => onEdit(job.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border hover:bg-muted"
              >
                <Pencil className="w-4 h-4" />
                Edit job
              </button>
            )}
            {canRestore && job && (
              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleArchive(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border hover:bg-muted"
              >
                <ArchiveRestore className="w-4 h-4" />
                Restore to board
              </button>
            )}
            {canArchive && job && (
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  if (!window.confirm('Archive this job? It will disappear from the board and list until you show archived jobs.')) return
                  void handleArchive(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <Archive className="w-4 h-4" />
                Archive job
              </button>
            )}
            {canComplete && job && (
              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleComplete()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-emerald-700 dark:text-emerald-400 hover:bg-muted"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark complete
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                disabled={!canInvoice}
                title={!canInvoice ? invoiceDisabledReason : 'Create invoice from this job'}
                onClick={() => {
                  if (job && canInvoice) onGenerateInvoice(job.id)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-[#0066CC] text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
              >
                <FileText className="w-4 h-4" />
                Generate invoice
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
