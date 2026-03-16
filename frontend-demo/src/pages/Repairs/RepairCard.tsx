import { useTranslation } from 'react-i18next'
import { User, Car, Clock, AlertCircle, Wrench } from 'lucide-react'
import { formatDate, formatCurrency } from '../../lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface RepairRow {
  id: number; job_number: string; job_type: string; status: string; priority: string
  owner_name: string | null; vehicle_make: string | null; vehicle_model: string | null
  vehicle_year: number | null; vehicle_plate: string | null
  technician_name: string | null; complaint: string | null; total: number; balance_due: number
  bay_number: string | null; created_at: string; expected_completion: string | null
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200',
  low:    'bg-muted text-muted-foreground border-border',
}

interface Props { repair: RepairRow; onClick: () => void }

export default function RepairCard({ repair, onClick }: Props): JSX.Element {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: repair.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const vehicle = [repair.vehicle_make, repair.vehicle_model, repair.vehicle_year].filter(Boolean).join(' ') || '—'

  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow select-none"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-muted-foreground">{repair.job_number}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[repair.priority] ?? PRIORITY_COLORS.normal}`}>
          {repair.priority.charAt(0).toUpperCase() + repair.priority.slice(1)}
        </span>
      </div>
      {repair.complaint && <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">{repair.complaint}</p>}
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><Car className="w-3 h-3" />{vehicle}{repair.vehicle_plate ? ` (${repair.vehicle_plate})` : ''}</div>
        {repair.owner_name && <div className="flex items-center gap-1.5"><User className="w-3 h-3" />{repair.owner_name}</div>}
        <div className="flex items-center gap-1.5"><Wrench className="w-3 h-3" />{repair.job_type}</div>
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{formatDate(repair.created_at)}</div>
        {repair.expected_completion && (
          <div className="flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />Due {formatDate(repair.expected_completion)}</div>
        )}
        {repair.bay_number && <div className="flex items-center gap-1.5 text-primary font-medium">{repair.bay_number}</div>}
      </div>
      {(repair.total > 0 || repair.balance_due > 0) && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total: {formatCurrency(repair.total)}</span>
          {repair.balance_due > 0 && <span className="text-destructive font-medium">Due: {formatCurrency(repair.balance_due)}</span>}
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
