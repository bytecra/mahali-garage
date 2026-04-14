import { useCallback, useEffect, useState } from 'react'

type JobLogRow = {
  id: number
  full_name: string | null
  action: string
  details: string | null
  created_at: string
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

function actionLabel(row: JobLogRow): string {
  if (row.action === 'job_card.create') return 'Created job'
  if (row.action === 'job_card.complete') return 'Completed job'
  if (row.action === 'job_card.archive') return 'Archived job'
  if (row.action === 'job_card.reactivate') return 'Reactivated job'
  if (row.action === 'job_card.invoice_generated') return 'Generated invoice'
  if (row.action === 'job_card.cost_add') return 'Added cost'
  if (row.action === 'job_card.status_update') return 'Changed status'
  if (row.action === 'job_card.attachment_add') return 'Added attachment'
  if (row.action === 'job_card.attachment_delete') return 'Deleted attachment'
  if (row.action === 'job_card.attachment_edit') return 'Edited attachment name'
  if (row.action === 'job_card.customer_change') return 'Changed customer'
  if (row.action === 'job_card.vehicle_change') return 'Changed vehicle'
  return row.action.replace(/^job_card\./, '').replace(/_/g, ' ')
}

function actionExtra(row: JobLogRow): string | null {
  if (!row.details) return null
  try {
    const d = JSON.parse(row.details) as Record<string, unknown>
    if (row.action === 'job_card.cost_add') {
      const amount = Number(d.amount ?? 0) || 0
      return `Cost ${amount.toFixed(2)}`
    }
    if (row.action === 'job_card.invoice_generated' && typeof d.invoice_number === 'string') {
      return `Invoice ${d.invoice_number}`
    }
    if (
      row.action === 'job_card.status_update' &&
      typeof d.from_status === 'string' &&
      typeof d.to_status === 'string'
    ) {
      return `From ${statusLabel(d.from_status)} to ${statusLabel(d.to_status)}`
    }
    if (
      row.action === 'job_card.complete' &&
      typeof d.from_status === 'string' &&
      typeof d.to_status === 'string'
    ) {
      return `From ${statusLabel(d.from_status)} to ${statusLabel(d.to_status)}`
    }
    if (row.action === 'job_card.attachment_add' && typeof d.attachment_name === 'string') {
      return `"${d.attachment_name}"`
    }
    if (row.action === 'job_card.attachment_delete' && typeof d.attachment_name === 'string') {
      return `"${d.attachment_name}"`
    }
    if (
      row.action === 'job_card.attachment_edit' &&
      typeof d.from_name === 'string' &&
      typeof d.to_name === 'string'
    ) {
      return `"${d.from_name}" → "${d.to_name}"`
    }
    if (
      (row.action === 'job_card.customer_change' || row.action === 'job_card.vehicle_change') &&
      typeof d.from_label === 'string' &&
      typeof d.to_label === 'string'
    ) {
      return `"${d.from_label}" → "${d.to_label}"`
    }
  } catch {
    return null
  }
  return null
}

export default function LogTab(props: { jobCardId: number | null; refreshKey?: number }): JSX.Element {
  const { jobCardId, refreshKey } = props
  const [logs, setLogs] = useState<JobLogRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!jobCardId) return
    setLoading(true)
    try {
      const res = await window.electronAPI.jobCards.listLogs(jobCardId)
      if (res.success && Array.isArray(res.data)) setLogs(res.data as JobLogRow[])
      else setLogs([])
    } finally {
      setLoading(false)
    }
  }, [jobCardId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  if (!jobCardId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Save the job first to view logs.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-3 bg-muted/10 min-h-[260px] max-h-[min(60vh,520px)] overflow-y-auto">
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading logs...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No log entries yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map(row => (
            <div key={row.id} className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm">
              <div className="font-medium text-foreground">
                {actionLabel(row)}
                {actionExtra(row) ? ` - ${actionExtra(row)}` : ''}
                {' by '}
                {(row.full_name ?? 'Admin')}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(row.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
