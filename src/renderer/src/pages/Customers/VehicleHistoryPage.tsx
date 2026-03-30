import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Car, ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { usePermission } from '../../hooks/usePermission'

interface VehicleRow {
  id: number
  owner_id: number | null
  make: string
  model: string
  year: number | null
  license_plate: string | null
  color: string | null
  owner_name?: string
}

interface JobHistoryRow {
  id: number
  job_number: string
  created_at: string
  date_in: string | null
  department: string
  status: string
  total: number
  balance_due: number
  deposit: number
  job_type: string
  work_done: string | null
  complaint: string | null
  diagnosis: string | null
  technician_name: string | null
  parts_summary: string | null
}

function deptLabel(d: string): string {
  if (d === 'programming') return 'Programming'
  if (d === 'both') return 'Both'
  return 'Mechanical'
}

function paymentLabel(total: number, balanceDue: number, status: string): string {
  if (status === 'cancelled') return 'Cancelled'
  const owed = Math.max(0, balanceDue)
  if (owed < 0.01) return 'Paid'
  if (owed < total - 0.01) return 'Partial'
  return 'Unpaid'
}

function servicesLine(j: JobHistoryRow): string {
  const parts = j.parts_summary?.trim()
  if (parts) return parts
  const work = j.work_done?.trim()
  if (work) return work
  const bits = [j.job_type, j.complaint?.trim(), j.diagnosis?.trim()].filter(Boolean) as string[]
  return bits.join(' · ') || '—'
}

export default function VehicleHistoryPage(): JSX.Element {
  const { t } = useTranslation()
  const { customerId, vehicleId } = useParams<{ customerId: string; vehicleId: string }>()
  const navigate = useNavigate()
  const canViewJobs = usePermission('repairs.view')

  const [vehicle, setVehicle] = useState<VehicleRow | null>(null)
  const [customerName, setCustomerName] = useState<string>('')
  const [jobs, setJobs] = useState<JobHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const cid = Number(customerId)
  const vid = Number(vehicleId)

  const load = useCallback(async () => {
    if (!customerId || !vehicleId || Number.isNaN(cid) || Number.isNaN(vid)) return
    setLoading(true)
    const [vehRes, custRes] = await Promise.all([
      window.electronAPI.vehicles.getById(vid),
      window.electronAPI.customers.getById(cid),
    ])
    if (vehRes.success && vehRes.data) {
      const v = vehRes.data as VehicleRow
      if (v.owner_id !== cid) {
        setVehicle(null)
        setLoading(false)
        return
      }
      setVehicle(v)
    } else setVehicle(null)

    if (custRes.success && custRes.data) {
      const c = custRes.data as { name: string }
      setCustomerName(c.name)
    }

    if (canViewJobs) {
      const jobRes = await window.electronAPI.jobCards.getForVehicle(vid)
      if (jobRes.success && Array.isArray(jobRes.data)) setJobs(jobRes.data as JobHistoryRow[])
      else setJobs([])
    } else setJobs([])

    setLoading(false)
  }, [customerId, vehicleId, cid, vid, canViewJobs])

  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => {
    let billed = 0
    let paid = 0
    for (const j of jobs) {
      if (j.status === 'cancelled') continue
      billed += j.total
      paid += Math.max(0, j.total - j.balance_due)
    }
    return { billed, paid }
  }, [jobs])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>{t('customers.vehicleNotFound', { defaultValue: 'Vehicle not found or does not belong to this customer.' })}</p>
        <button type="button" onClick={() => navigate(`/owners/${customerId}`)} className="mt-4 text-sm text-primary hover:underline">
          {t('common.back')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground mb-4">
        <Link to="/owners" className="hover:text-foreground transition-colors">
          {t('nav.owners')}
        </Link>
        <ChevronRight className="w-4 h-4 shrink-0" />
        <Link to={`/owners/${customerId}`} className="hover:text-foreground transition-colors">
          {customerName || t('customers.title')}
        </Link>
        <ChevronRight className="w-4 h-4 shrink-0" />
        <span className="text-foreground font-medium">
          {vehicle.make} {vehicle.model}
        </span>
      </nav>

      <button
        type="button"
        onClick={() => navigate(`/owners/${customerId}`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('customers.backToProfile', { defaultValue: 'Back to customer' })}
      </button>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {vehicle.make} {vehicle.model}
              {vehicle.year != null ? ` (${vehicle.year})` : ''}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {vehicle.license_plate && (
                <span>
                  <span className="text-xs uppercase tracking-wide me-1">{t('vehicles.plate', { defaultValue: 'Plate' })}</span>
                  {vehicle.license_plate}
                </span>
              )}
              {vehicle.color && (
                <span>
                  <span className="text-xs uppercase tracking-wide me-1">{t('vehicles.color', { defaultValue: 'Color' })}</span>
                  {vehicle.color}
                </span>
              )}
            </div>
          </div>
        </div>

        {canViewJobs && jobs.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('customers.totalBilled', { defaultValue: 'Total billed' })}</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(totals.billed)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('customers.totalPaid', { defaultValue: 'Total paid' })}</p>
              <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">{formatCurrency(totals.paid)}</p>
            </div>
          </div>
        )}
      </div>

      {!canViewJobs && (
        <p className="text-sm text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          {t('customers.jobHistoryNoPermission', { defaultValue: 'You do not have permission to view job card history.' })}
        </p>
      )}

      <h2 className="text-sm font-semibold text-foreground mb-3">
        {t('customers.invoiceJobHistory', { defaultValue: 'Invoice & job history' })}
      </h2>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {jobs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {canViewJobs
              ? t('customers.noVehicleJobs', { defaultValue: 'No job cards for this vehicle yet.' })
              : '—'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map(j => (
              <div key={j.id} className="px-4 py-4 hover:bg-muted/20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{j.job_number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(j.date_in || j.created_at)}
                      <span className="mx-2">·</span>
                      {deptLabel(j.department)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-medium tabular-nums">{formatCurrency(j.total)}</p>
                    <p className="text-xs mt-0.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                        paymentLabel(j.total, j.balance_due, j.status) === 'Paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : paymentLabel(j.total, j.balance_due, j.status) === 'Cancelled'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                      }`}>
                        {paymentLabel(j.total, j.balance_due, j.status)}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-foreground mt-2">{servicesLine(j)}</p>
                {j.balance_due > 0.01 && j.status !== 'cancelled' && (
                  <p className="text-xs text-destructive mt-1">
                    {t('customers.balanceDue', { defaultValue: 'Balance due' })}: {formatCurrency(j.balance_due)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
