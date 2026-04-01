import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../../lib/utils'
import { parseTvDisplayWidgets } from '../../lib/tvDisplayWidgets'

type DashboardData = {
  todayRevenue: number
  vehiclesInGarageMechanical: number
  vehiclesInGarageProgramming: number
  readyForPickupMechanical: number
  readyForPickupProgramming: number
  activeJobCardsMechanical: number
  activeJobCardsProgramming: number
  todayDeliveredMechanical: number
  todayDeliveredProgramming: number
}

type CashMethod = { cash: number; non_cash: number; total: number }

type TvJobCard = {
  id: number
  status: string
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_plate: string | null
  job_type: string
  technician_name: string | null
}

const TV_COLUMNS = [
  { key: 'in_progress', label: 'In Progress', color: 'border-blue-500' },
  { key: 'waiting_parts', label: 'Waiting for Parts', color: 'border-amber-500' },
  { key: 'waiting_for_programming', label: 'Waiting for Programming', color: 'border-violet-500' },
  { key: 'ready', label: 'Ready for Pickup', color: 'border-emerald-500' },
] as const

function nowClock(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

function nowDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TvDisplayPage(): JSX.Element {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [cash, setCash] = useState<CashMethod>({ cash: 0, non_cash: 0, total: 0 })
  const [jobs, setJobs] = useState<TvJobCard[]>([])
  const [garageName, setGarageName] = useState('Mahali Garage')
  const [now, setNow] = useState(new Date())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [widgets, setWidgets] = useState(() => parseTvDisplayWidgets())

  async function loadData(): Promise<void> {
    try {
      const [settingsRes, dashRes, cashRes, jobsRes] = await Promise.all([
        window.electronAPI.settings.getAll(),
        window.electronAPI.dashboard.getSummary(),
        window.electronAPI.reports.cashByMethod(new Date().toISOString().slice(0, 10)),
        window.electronAPI.jobCards.getByStatus(),
      ])

      if (settingsRes.success && settingsRes.data) {
        const s = settingsRes.data as Record<string, string>
        setGarageName(s['app.name'] || s['store.name'] || 'Mahali Garage')
        setWidgets(parseTvDisplayWidgets(s['tv_display_widgets'] ?? null))
      }
      if (dashRes.success && dashRes.data) setDashboard(dashRes.data as DashboardData)
      if (cashRes.success && cashRes.data) setCash(cashRes.data as CashMethod)
      if (jobsRes.success && jobsRes.data) setJobs(jobsRes.data as TvJobCard[])
      setLastUpdated(new Date())
    } catch {
      // keep existing snapshot on transient failures
    }
  }

  useEffect(() => {
    void loadData()
    const i = setInterval(() => void loadData(), 30_000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    const keyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', keyHandler)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [])

  const byStatus = useMemo(() => {
    const out: Record<string, TvJobCard[]> = {}
    for (const c of TV_COLUMNS) out[c.key] = []
    for (const j of jobs) {
      if (!out[j.status]) continue
      out[j.status].push(j)
    }
    return out
  }, [jobs])

  const statCls = 'rounded-xl border border-slate-700 bg-slate-900/80 p-5'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <button
        type="button"
        onClick={() => window.close()}
        className="fixed top-3 right-4 text-slate-300 hover:text-white text-2xl leading-none"
        aria-label="Close TV display"
      >
        ×
      </button>

      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-5xl font-bold tracking-wide">{garageName}</h1>
          <p className="text-slate-400 text-lg mt-1">TV Display Mode</p>
        </div>
        {widgets.current_time_date && (
          <div className="text-right">
            <div className="text-6xl font-semibold tabular-nums">{nowClock(now)}</div>
            <div className="text-2xl text-slate-300 mt-1">{nowDate(now)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {widgets.vehicles_in_garage && <div className={statCls}>
          <div className="text-xl text-slate-300">Vehicles in Garage</div>
          <div className="text-5xl font-bold text-emerald-400 mt-2">
            M: {dashboard?.vehiclesInGarageMechanical ?? 0} <span className="text-slate-500">|</span> P: {dashboard?.vehiclesInGarageProgramming ?? 0}
          </div>
        </div>}
        {widgets.active_job_cards && <div className={statCls}>
          <div className="text-xl text-slate-300">Active Job Cards</div>
          <div className="text-5xl font-bold text-blue-400 mt-2">
            M: {dashboard?.activeJobCardsMechanical ?? 0} <span className="text-slate-500">|</span> P: {dashboard?.activeJobCardsProgramming ?? 0}
          </div>
        </div>}
        {widgets.ready_for_pickup && <div className={statCls}>
          <div className="text-xl text-slate-300">Ready for Pickup</div>
          <div className="text-5xl font-bold text-emerald-400 mt-2">
            M: {dashboard?.readyForPickupMechanical ?? 0} <span className="text-slate-500">|</span> P: {dashboard?.readyForPickupProgramming ?? 0}
          </div>
        </div>}

        {widgets.today_delivered && <div className={statCls}>
          <div className="text-xl text-slate-300">Today's Delivered</div>
          <div className="text-5xl font-bold text-emerald-400 mt-2">
            M: {dashboard?.todayDeliveredMechanical ?? 0} <span className="text-slate-500">|</span> P: {dashboard?.todayDeliveredProgramming ?? 0}
          </div>
        </div>}
        {widgets.cash_in_hand && <div className={statCls}>
          <div className="text-xl text-slate-300">Cash in Hand</div>
          <div className="text-5xl font-bold text-yellow-300 mt-2">{formatCurrency(cash.cash)}</div>
        </div>}
        {widgets.today_sales && <div className={statCls}>
          <div className="text-xl text-slate-300">Today's Sales</div>
          <div className="text-5xl font-bold text-green-400 mt-2">{formatCurrency(dashboard?.todayRevenue ?? 0)}</div>
        </div>}
      </div>

      {widgets.job_cards_kanban && (
        <div className="grid grid-cols-4 gap-4">
          {TV_COLUMNS.map(col => (
            <div key={col.key} className={`rounded-xl border-2 ${col.color} bg-slate-900/70 min-h-[40vh]`}>
              <div className="px-4 py-3 border-b border-slate-700 text-2xl font-semibold">
                {col.label} <span className="text-slate-400">({byStatus[col.key]?.length ?? 0})</span>
              </div>
              <div className="p-3 space-y-3">
                {(byStatus[col.key] ?? []).slice(0, 8).map(j => (
                  <div key={j.id} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                    <p className="text-xl font-semibold">
                      {[j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(' ') || 'Vehicle'}
                      {j.vehicle_plate ? ` (${j.vehicle_plate})` : ''}
                    </p>
                    <p className="text-lg text-slate-300 mt-1">{j.job_type || 'Job Card'}</p>
                    <p className="text-lg text-slate-400 mt-1">{j.technician_name || 'Unassigned'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-right text-lg text-slate-400">
        Last updated: {lastUpdated ? nowClock(lastUpdated) : '—'}
      </div>
    </div>
  )
}

