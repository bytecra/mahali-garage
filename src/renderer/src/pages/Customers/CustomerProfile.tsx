import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Phone, Pencil, ChevronRight, Car, Plus, Eye, AlertCircle } from 'lucide-react'
import { formatDate } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import CustomerForm from './CustomerForm'
import Modal from '../../components/shared/Modal'
import { useAuthStore } from '../../store/authStore'

interface SummaryStats {
  total_spent: number
  total_paid: number
  total_visits: number
  outstanding_balance: number
  last_visit: string | null
}

interface CustomerDetail {
  id: number; name: string; phone: string | null; email: string | null
  address: string | null; notes: string | null; balance: number
  sale_count: number; repair_count: number
  summaryStats?: SummaryStats
}

interface OwnerVehicleRow {
  id: number; make: string; model: string
  year: number | null; license_plate: string | null
}

interface JobHistoryRow {
  id: number
  job_number: string
  created_at: string
  date_in: string | null
  status: string
  total: number
  balance_due: number
  job_type: string
  work_done: string | null
  complaint: string | null
  diagnosis: string | null
  parts_summary: string | null
}

const emptyVehicleForm = { make: '', model: '', year: '', license_plate: '', color: '' }

function servicesLine(j: JobHistoryRow): string {
  const parts = j.parts_summary?.trim()
  if (parts) return parts
  const work = j.work_done?.trim()
  if (work) return work
  const bits = [j.job_type, j.complaint?.trim(), j.diagnosis?.trim()].filter(Boolean) as string[]
  return bits.join(' · ') || '—'
}

export default function CustomerProfile(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const canEdit   = usePermission('customers.edit')
  const canDelete = usePermission('customers.delete')
  const user = useAuthStore(s => s.user)
  const role = user?.role

  const [customer, setCustomer]               = useState<CustomerDetail | null>(null)
  const [vehicles, setVehicles]               = useState<OwnerVehicleRow[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [vehicleJobs, setVehicleJobs]         = useState<JobHistoryRow[]>([])
  const [loadingJobs, setLoadingJobs]         = useState(false)
  const [loading, setLoading]                 = useState(true)
  const [editOpen, setEditOpen]               = useState(false)
  const [deleteOpen, setDeleteOpen]           = useState(false)
  const [addVehicleOpen, setAddVehicleOpen]   = useState(false)
  const [vehicleForm, setVehicleForm]         = useState(emptyVehicleForm)
  const [savingVehicle, setSavingVehicle]     = useState(false)

  const [loyaltyConfig, setLoyaltyConfig] = useState<{
    enabled: boolean
    deptMode: 'combined' | 'per_dept'
    type: string
    pointsLabel: string
    stampsForReward: number
    showInProfile: boolean
    allowManualAdjust: boolean
  } | null>(null)

  const [loyaltyRows, setLoyaltyRows] = useState<Array<{
    department: string
    points: number
    stamps: number
    total_visits: number
    tier_level: number
  }>>([])

  const [loyaltyTxs, setLoyaltyTxs] = useState<Array<{
    id: number
    department: string
    type: string
    points_delta: number
    stamps_delta: number
    visits_delta: number
    note: string | null
    created_at: string
  }>>([])

  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustStamps, setAdjustStamps] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustDept, setAdjustDept] = useState<'all' | 'mechanical' | 'programming'>('all')
  const [adjustSaving, setAdjustSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoyaltyRows([])
    setLoyaltyTxs([])
    setLoyaltyConfig(null)
    const cid = Number(id)
    const [custRes, vehRes] = await Promise.all([
      window.electronAPI.customers.getById(cid),
      window.electronAPI.vehicles.getByOwner(cid),
    ])
    if (custRes.success) setCustomer(custRes.data as CustomerDetail)
    const vehs = vehRes.success ? (vehRes.data as OwnerVehicleRow[]) ?? [] : []
    setVehicles(vehs)
    setSelectedVehicleId(prev => {
      if (prev && vehs.some(v => v.id === prev)) return prev
      return vehs.length > 0 ? vehs[0].id : null
    })

    const lcRes = await window.electronAPI.settings.get('loyalty.config')
    if (lcRes?.success && lcRes.data) {
      try {
        const lc = JSON.parse(lcRes.data) as {
          enabled?: boolean
          deptMode?: 'combined' | 'per_dept'
          type?: string
          pointsLabel?: string
          stampsForReward?: number
          showInProfile?: boolean
          allowManualAdjust?: boolean
        }
        setLoyaltyConfig({
          enabled: Boolean(lc.enabled),
          deptMode: lc.deptMode === 'per_dept' ? 'per_dept' : 'combined',
          type: lc.type ?? 'points',
          pointsLabel: lc.pointsLabel ?? 'Points',
          stampsForReward: lc.stampsForReward ?? 10,
          showInProfile: lc.showInProfile !== false,
          allowManualAdjust: lc.allowManualAdjust !== false,
        })
        if (lc.enabled && lc.showInProfile !== false && custRes.success) {
          const rows = await window.electronAPI.loyalty.getAllDepts(cid)
          if (rows?.success && Array.isArray(rows.data)) {
            setLoyaltyRows(
              (rows.data as Array<{
                department: string
                points: number
                stamps: number
                total_visits: number
                tier_level: number
              }>).map(r => ({
                department: r.department,
                points: r.points,
                stamps: r.stamps,
                total_visits: r.total_visits,
                tier_level: r.tier_level,
              }))
            )
          }
          const txs = await window.electronAPI.loyalty.getTransactions(cid, 15)
          if (txs?.success && Array.isArray(txs.data)) {
            setLoyaltyTxs(
              (txs.data as Array<{
                id: number
                department: string
                type: string
                points_delta: number
                stamps_delta: number
                visits_delta: number
                note: string | null
                created_at: string
              }>).map(tx => ({
                id: tx.id,
                department: tx.department,
                type: tx.type,
                points_delta: tx.points_delta,
                stamps_delta: tx.stamps_delta,
                visits_delta: tx.visits_delta,
                note: tx.note,
                created_at: tx.created_at,
              }))
            )
          }
        }
      } catch { /* non-fatal */ }
    }

    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!selectedVehicleId) { setVehicleJobs([]); return }
    setLoadingJobs(true)
    void window.electronAPI.jobCards.getForVehicle(selectedVehicleId).then(res => {
      if (res.success && Array.isArray(res.data)) setVehicleJobs(res.data as JobHistoryRow[])
      else setVehicleJobs([])
      setLoadingJobs(false)
    })
  }, [selectedVehicleId])

  const handleDelete = async () => {
    if (!customer) return
    const res = await window.electronAPI.customers.delete(customer.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    navigate('/owners')
  }

  const handleAddVehicle = async () => {
    if (!customer || !vehicleForm.make.trim() || !vehicleForm.model.trim()) {
      toast.error('Make and model are required')
      return
    }
    setSavingVehicle(true)
    const res = await window.electronAPI.vehicles.create({
      owner_id: customer.id,
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year: vehicleForm.year ? Number(vehicleForm.year) : null,
      license_plate: vehicleForm.license_plate.trim() || null,
      color: vehicleForm.color.trim() || null,
    })
    setSavingVehicle(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success('Vehicle added')
    setAddVehicleOpen(false)
    setVehicleForm(emptyVehicleForm)
    void load()
  }

  async function handleLoyaltyAdjust(): Promise<void> {
    if (!adjustNote.trim() || !customer) return
    if (!user) {
      toast.error(t('common.error'))
      return
    }
    setAdjustSaving(true)
    try {
      const res = await window.electronAPI.loyalty.addTransaction({
        customer_id: customer.id,
        department: adjustDept,
        type: 'manual_adjust',
        points_delta: parseInt(adjustPoints, 10) || 0,
        stamps_delta: parseInt(adjustStamps, 10) || 0,
        visits_delta: 0,
        source: 'manual',
        note: adjustNote.trim(),
        created_by: user.userId,
      })
      if (!res.success) {
        toast.error(res.error ?? t('common.error'))
        return
      }
      toast.success(t('common.success'))
      setAdjustOpen(false)
      setAdjustPoints('')
      setAdjustStamps('')
      setAdjustNote('')
      const rows = await window.electronAPI.loyalty.getAllDepts(customer.id)
      if (rows?.success && Array.isArray(rows.data)) {
        setLoyaltyRows(
          (rows.data as Array<{
            department: string
            points: number
            stamps: number
            total_visits: number
            tier_level: number
          }>).map(r => ({
            department: r.department,
            points: r.points,
            stamps: r.stamps,
            total_visits: r.total_visits,
            tier_level: r.tier_level,
          }))
        )
      }
      const txs = await window.electronAPI.loyalty.getTransactions(customer.id, 15)
      if (txs?.success && Array.isArray(txs.data)) {
        setLoyaltyTxs(
          (txs.data as Array<{
            id: number
            department: string
            type: string
            points_delta: number
            stamps_delta: number
            visits_delta: number
            note: string | null
            created_at: string
          }>).map(tx => ({
            id: tx.id,
            department: tx.department,
            type: tx.type,
            points_delta: tx.points_delta,
            stamps_delta: tx.stamps_delta,
            visits_delta: tx.visits_delta,
            note: tx.note,
            created_at: tx.created_at,
          }))
        )
      }
    } catch {
      toast.error(t('common.error'))
    } finally {
      setAdjustSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
  if (!customer) return (
    <div className="text-center py-16 text-muted-foreground">Customer not found</div>
  )

  const stats           = customer.summaryStats
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) ?? null
  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1 text-foreground'

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground mb-4">
        <Link to="/owners" className="hover:text-foreground transition-colors">
          {t('nav.owners')}
        </Link>
        <ChevronRight className="w-4 h-4 shrink-0" />
        <span className="text-foreground font-medium">{customer.name}</span>
      </nav>

      <button
        onClick={() => navigate('/owners')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* ── Header card ── */}
      <div className="bg-card border border-border rounded-xl p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary text-xl font-bold shrink-0">
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{customer.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                {customer.phone && (
                  <>
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{customer.phone}</span>
                    <span className="mx-1">·</span>
                  </>
                )}
                <span>Total cars: {vehicles.length}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />{t('common.edit')}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-3 py-1.5 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total pay</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
              <CurrencyText amount={stats?.total_paid ?? 0} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Debt</p>
            {(stats?.outstanding_balance ?? 0) > 0 ? (
              <p className="text-lg font-bold text-destructive tabular-nums flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <CurrencyText amount={stats!.outstanding_balance} />
              </p>
            ) : (
              <p className="text-lg font-bold text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last visit</p>
            <p className="text-lg font-bold text-foreground">
              {stats?.last_visit ? formatDate(stats.last_visit) : '—'}
            </p>
          </div>
        </div>
      </div>

      {loyaltyConfig?.enabled &&
        loyaltyConfig?.showInProfile && (
        <div className="mt-6 border border-border rounded-xl p-4 space-y-4 mb-5">

          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              🏆 Loyalty Program
            </h3>
            {(role === 'owner' || role === 'manager') &&
              loyaltyConfig.allowManualAdjust && (
              <button
                type="button"
                onClick={() => setAdjustOpen(true)}
                className="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-muted/50"
              >
                Manual Adjust
              </button>
            )}
          </div>

          <div className="grid gap-2">
            {loyaltyRows.length === 0 ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    {loyaltyConfig.pointsLabel || 'Points'}
                  </p>
                  <p className="font-bold text-lg">0</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Stamps</p>
                  <p className="font-bold text-lg">
                    0/{loyaltyConfig.stampsForReward}
                  </p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Visits</p>
                  <p className="font-bold text-lg">0</p>
                </div>
              </div>
            ) : loyaltyRows.map(row => (
              <div key={row.department}>
                {loyaltyConfig.deptMode === 'per_dept' && (
                  <p className="text-xs font-medium text-muted-foreground capitalize mb-1">
                    {row.department === 'all' ? 'All' : row.department}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      {loyaltyConfig.pointsLabel || 'Points'}
                    </p>
                    <p className="font-bold text-lg">
                      {row.points}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Stamps</p>
                    <p className="font-bold text-lg">
                      {row.stamps}/
                      {loyaltyConfig.stampsForReward}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Visits</p>
                    <p className="font-bold text-lg">
                      {row.total_visits}
                    </p>
                  </div>
                </div>
                {row.tier_level > 0 && (
                  <p className="text-xs text-primary mt-1">
                    ⭐ Tier {row.tier_level} Customer
                  </p>
                )}
              </div>
            ))}
          </div>

          {loyaltyTxs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Recent Activity
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {loyaltyTxs.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <div>
                      <span className="capitalize">
                        {tx.type.replace(/_/g, ' ')}
                      </span>
                      {tx.note && (
                        <span className="text-muted-foreground ml-1">
                          — {tx.note}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 text-right shrink-0">
                      {tx.points_delta !== 0 && (
                        <span className={tx.points_delta > 0 ? 'text-green-600' : 'text-red-500'}>
                          {tx.points_delta > 0 ? '+' : ''}
                          {tx.points_delta}pts
                        </span>
                      )}
                      {tx.stamps_delta !== 0 && (
                        <span className={tx.stamps_delta > 0 ? 'text-blue-600' : 'text-red-500'}>
                          {tx.stamps_delta > 0 ? '+' : ''}
                          {tx.stamps_delta}🎫
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adjustOpen && (
            <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
              <p className="text-sm font-medium">
                Manual Adjustment
              </p>
              {loyaltyConfig.deptMode === 'per_dept' && (
                <select
                  value={adjustDept}
                  onChange={e => setAdjustDept(
                    e.target.value as typeof adjustDept
                  )}
                  className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                >
                  <option value="all">All</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="programming">Programming</option>
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Points (+/-)"
                  value={adjustPoints}
                  onChange={e => setAdjustPoints(e.target.value)}
                  className="border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                />
                <input
                  type="number"
                  placeholder="Stamps (+/-)"
                  value={adjustStamps}
                  onChange={e => setAdjustStamps(e.target.value)}
                  className="border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                />
              </div>
              <input
                type="text"
                placeholder="Reason (required)"
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleLoyaltyAdjust()}
                  disabled={adjustSaving || !adjustNote.trim()}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                >
                  {adjustSaving ? 'Saving...' : 'Apply'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustOpen(false)}
                  className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Vehicles tabs ── */}
      <div className="bg-card border border-border rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Vehicles</h2>
          </div>
          {canEdit && (
            <button
              onClick={() => setAddVehicleOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />Add vehicle
            </button>
          )}
        </div>

        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            No vehicles linked — add one above.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {vehicles.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVehicleId(v.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  selectedVehicleId === v.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {v.make}: {v.model}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Service history ── */}
      {selectedVehicle && (
        <>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Service history — {selectedVehicle.make} {selectedVehicle.model}
            {selectedVehicle.year ? ` (${selectedVehicle.year})` : ''}
            {selectedVehicle.license_plate ? ` · ${selectedVehicle.license_plate}` : ''}
          </h2>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingJobs ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : vehicleJobs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No service history for this vehicle yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium">Service</th>
                    <th className="text-start px-4 py-3 font-medium">Date</th>
                    <th className="text-end px-4 py-3 font-medium">Price</th>
                    <th className="text-center px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicleJobs.map(j => (
                    <tr key={j.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-foreground truncate">{servicesLine(j)}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{j.job_number}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(j.date_in || j.created_at)}
                      </td>
                      <td className="px-4 py-3 text-end font-medium tabular-nums">
                        <CurrencyText amount={j.total} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => navigate(`/owners/${customer.id}/vehicles/${selectedVehicleId}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Add Vehicle Modal ── */}
      <Modal open={addVehicleOpen} onClose={() => { setAddVehicleOpen(false); setVehicleForm(emptyVehicleForm) }} title="Add Vehicle">
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Make <span className="text-destructive">*</span></label>
              <input
                value={vehicleForm.make}
                onChange={e => setVehicleForm(f => ({ ...f, make: e.target.value }))}
                placeholder="e.g. Nissan"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Model <span className="text-destructive">*</span></label>
              <input
                value={vehicleForm.model}
                onChange={e => setVehicleForm(f => ({ ...f, model: e.target.value }))}
                placeholder="e.g. Altima"
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Year</label>
              <input
                type="number"
                min={1900}
                max={2099}
                value={vehicleForm.year}
                onChange={e => setVehicleForm(f => ({ ...f, year: e.target.value }))}
                placeholder="e.g. 2022"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>License Plate</label>
              <input
                value={vehicleForm.license_plate}
                onChange={e => setVehicleForm(f => ({ ...f, license_plate: e.target.value }))}
                placeholder="e.g. A 12345"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <input
              value={vehicleForm.color}
              onChange={e => setVehicleForm(f => ({ ...f, color: e.target.value }))}
              placeholder="e.g. White"
              className={inputCls}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { setAddVehicleOpen(false); setVehicleForm(emptyVehicleForm) }}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddVehicle()}
              disabled={savingVehicle}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {savingVehicle ? 'Saving…' : 'Add Vehicle'}
            </button>
          </div>
        </div>
      </Modal>

      <CustomerForm
        open={editOpen}
        customerId={customer.id}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); void load() }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={t('common.delete')}
        message={`Delete customer "${customer.name}"? All their records will remain but the customer profile will be removed.`}
        confirmLabel={t('common.delete')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
