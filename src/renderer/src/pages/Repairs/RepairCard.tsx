import { User, Car, Clock, AlertCircle, Wrench, FileText } from 'lucide-react'
import { formatDate, formatCurrency } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface RepairRow {
  id: number; job_number: string; job_type: string; status: string; priority: string
  department?: string
  job_invoice_number?: string | null
  job_invoice_status?: string | null
  /** 1 = hidden from board until restored */
  archived?: number | null
  /** 0 = quick intake / not fully filled */
  profile_complete?: number | null
  owner_name: string | null
  owner_phone?: string | null
  vehicle_make: string | null; vehicle_model: string | null
  vehicle_year: number | null; vehicle_plate: string | null
  vehicle_vin?: string | null
  technician_name: string | null; complaint: string | null; total: number; balance_due: number
  bay_number: string | null; created_at: string; expected_completion: string | null
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200',
  low:    'bg-muted text-muted-foreground border-border',
}

/** Short line for toasts (job # + vehicle / plate / customer). */
export function jobCardToastHint(r: Pick<RepairRow, 'vehicle_make' | 'vehicle_model' | 'vehicle_plate' | 'owner_name'>): string {
  const mm = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ').trim()
  const parts: string[] = []
  if (mm) parts.push(mm)
  if (r.vehicle_plate?.trim()) parts.push(r.vehicle_plate.trim())
  if (parts.length === 0 && r.owner_name?.trim()) parts.push(r.owner_name.trim())
  return parts.length ? parts.join(' · ') : '—'
}

const DEPT_BADGE: Record<string, string> = {
  mechanical:  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-200/60',
  programming: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300 border-violet-200/60',
  both:        'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 border-teal-200/60',
}

function deptLabel(d: string | undefined): string {
  if (d === 'programming') return 'Prog'
  if (d === 'both') return 'Both'
  return 'Mech'
}

interface Props {
  repair: RepairRow
  /** Defaults to no-op (e.g. drag overlay preview). */
  onClick?: () => void
  /** Opens job detail drawer (invoice workflow); does not replace card click. */
  onOpenDetails?: () => void
}

export default function RepairCard({ repair, onClick = () => {}, onOpenDetails }: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: repair.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const vehicle = [repair.vehicle_make, repair.vehicle_model, repair.vehicle_year].filter(Boolean).join(' ') || '—'
  const isDraft = repair.profile_complete === 0
  const isArchived = repair.archived === 1
  const deptKey = repair.department ?? 'mechanical'

  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow select-none relative"
    >
      {onOpenDetails && (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/90 border border-border text-primary hover:bg-muted shadow-sm"
          title="Job details & invoice"
          aria-label="Job details and generate invoice"
          onClick={e => {
            e.stopPropagation()
            e.preventDefault()
            onOpenDetails()
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <FileText className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap pr-8">
        <span className="font-mono text-xs text-muted-foreground">{repair.job_number}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide bg-muted text-muted-foreground border-border">
              Archived
            </span>
          )}
          {isDraft && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300/60">
              Draft
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${DEPT_BADGE[deptKey] ?? DEPT_BADGE.mechanical}`}>
            {deptLabel(repair.department)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[repair.priority] ?? PRIORITY_COLORS.normal}`}>
            {repair.priority.charAt(0).toUpperCase() + repair.priority.slice(1)}
          </span>
        </div>
      </div>
      {repair.complaint ? (
        <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">{repair.complaint}</p>
      ) : isDraft ? (
        <p className="text-xs text-amber-800 dark:text-amber-200/90 mb-2">No job details yet — open to add line items.</p>
      ) : null}
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><Car className="w-3 h-3" />{vehicle}{repair.vehicle_plate ? ` (${repair.vehicle_plate})` : ''}</div>
        {repair.owner_name && <div className="flex items-center gap-1.5"><User className="w-3 h-3" />{repair.owner_name}</div>}
        <div className="flex items-center gap-1.5"><Wrench className="w-3 h-3" />{repair.job_type}</div>
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{formatDate(repair.created_at)}</div>
        {repair.expected_completion && (
          <div className="flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />Due {formatDate(repair.expected_completion)}</div>
        )}
        {repair.bay_number && <div className="flex items-center gap-1.5 text-primary font-medium">{repair.bay_number}</div>}
        {repair.job_invoice_number && (
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
            <FileText className="w-3 h-3 shrink-0" />
            Invoice {repair.job_invoice_number}
            {repair.job_invoice_status ? (
              <span className="text-muted-foreground font-normal">({repair.job_invoice_status})</span>
            ) : null}
          </div>
        )}
      </div>
      {(repair.total > 0 || repair.balance_due > 0) && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total: <CurrencyText amount={repair.total} /></span>
          {repair.balance_due > 0 && <span className="text-destructive font-medium">Due: <CurrencyText amount={repair.balance_due} className="text-destructive" /></span>}
        </div>
      )}
      {repair.technician_name && (
        <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {repair.technician_name[0]}
          </div>
          {repair.technician_name}
        </div>
      )}
    </div>
  )
}
