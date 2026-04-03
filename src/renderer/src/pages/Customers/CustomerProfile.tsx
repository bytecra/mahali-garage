import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Phone, Pencil, ChevronRight, Car, Plus, Eye, AlertCircle, Gift } from 'lucide-react'
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
  const canManualAdjustLoyalty = ['owner', 'manager'].includes(user?.role ?? '')

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

  const [loyalty, setLoyalty] = useState<{
    points: number
    stamps: number
    total_visits: number
    tier_level: number
  } | null>(null)
  const [loyaltyConfig, setLoyaltyConfig] = useState<{
    enabled: boolean
    type?: 'points' | 'stamps' | 'tiers' | 'all'
    pointsLabel?: string
    stampsForReward?: number
  } | null>(null)
  const [loyaltyTxs, setLoyaltyTxs] = useState<
    Array<{
      id: number
      type: string
      points_delta: number
      stamps_delta: number
      note: string | null
      created_at: string
    }>
  >([])
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustPoints, setAdjustPoints] = useState(0)
  const [adjustStamps, setAdjustStamps] = useState(0)
  const [adjustSaving, setAdjustSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoyalty(null)
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

    const configRes = await window.electronAPI.settings.get('loyalty.config')
    let parsedLoyalty: {
      enabled: boolean
      type?: 'points' | 'stamps' | 'tiers' | 'all'
      pointsLabel?: string
      stampsForReward?: number
    } | null = null
    if (configRes?.success && configRes.data) {
      try {
        parsedLoyalty = JSON.parse(configRes.data) as typeof parsedLoyalty
        setLoyaltyConfig(parsedLoyalty)
      } catch {
        setLoyaltyConfig(null)
      }
    }

    if (parsedLoyalty?.enabled && custRes.success) {
      const lr = await window.electronAPI.loyalty.get(cid)
      if (lr?.success && lr.data) {
        const d = lr.data as { points: number; stamps: number; total_visits: number; tier_level: number }
        setLoyalty({
          points: d.points,
          stamps: d.stamps,
          total_visits: d.total_visits,
          tier_level: d.tier_level,
        })
      }
      const txr = await window.electronAPI.loyalty.getTransactions(cid, 10)
      if (txr?.success && Array.isArray(txr.data)) {
        setLoyaltyTxs(
          (txr.data as Array<{
            id: number
            type: string
            points_delta: number
            stamps_delta: number
            note: string | null
            created_at: string
          }>).map(r => ({
            id: r.id,
            type: r.type,
            points_delta: r.points_delta,
            stamps_delta: r.stamps_delta,
            note: r.note,
            created_at: r.created_at,
          }))
        )
      }
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

  const refreshLoyaltyData = useCallback(async () => {
    if (!customer || !loyaltyConfig?.enabled) return
    const lr = await window.electronAPI.loyalty.get(customer.id)
    if (lr.success && lr.data) {
      const d = lr.data as { points: number; stamps: number; total_visits: number; tier_level: number }
      setLoyalty({
        points: d.points,
        stamps: d.stamps,
        total_visits: d.total_visits,
        tier_level: d.tier_level,
      })
    }
    const txr = await window.electronAPI.loyalty.getTransactions(customer.id, 10)
    if (txr.success && Array.isArray(txr.data)) {
      setLoyaltyTxs(
        (txr.data as Array<{
          id: number
          type: string
          points_delta: number
          stamps_delta: number
          note: string | null
          created_at: string
        }>).map(r => ({
          id: r.id,
          type: r.type,
          points_delta: r.points_delta,
          stamps_delta: r.stamps_delta,
          note: r.note,
          created_at: r.created_at,
        }))
      )
    }
  }, [customer, loyaltyConfig?.enabled])

  const handleLoyaltyAdjustSubmit = async () => {
    if (!customer) return
    const note = adjustNote.trim()
    if (!note) {
      toast.error('Note is required')
      return
    }
    if (!user) {
      toast.error(t('common.error'))
      return
    }
    setAdjustSaving(true)
    const res = await window.electronAPI.loyalty.addTransaction({
      customer_id: customer.id,
      type: 'manual_adjust',
      points_delta: adjustPoints,
      stamps_delta: adjustStamps,
      visits_delta: 0,
      source: 'manual',
      note,
      created_by: user.userId,
    })
    setAdjustSaving(false)
    if (!res.success) {
      toast.error(res.error ?? t('common.error'))
      return
    }
    toast.success(t('common.success'))
    setAdjustOpen(false)
    setAdjustNote('')
    setAdjustPoints(0)
    setAdjustStamps(0)
    void refreshLoyaltyData()
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

  const progType = loyaltyConfig?.type ?? 'points'
  const showPointsRow = progType === 'points' || progType === 'all'
  const showStampsRow = progType === 'stamps' || progType === 'all'
  const showVisitsRow = progType === 'stamps' || progType === 'tiers' || progType === 'all'
  const showTierRow = progType === 'tiers' || progType === 'all'
  const pointsLabel = loyaltyConfig?.pointsLabel?.trim() || 'Points'
  const stampsForReward = loyaltyConfig?.stampsForReward ?? 10

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

      {/* ── Loyalty Program ── */}
      {loyaltyConfig?.enabled && (
        <div className="bg-card border border-border rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Loyalty Program</h2>
            </div>
            {canManualAdjustLoyalty && (
              <button
                type="button"
                onClick={() => {
                  setAdjustOpen(o => !o)
                  setAdjustNote('')
                  setAdjustPoints(0)
                  setAdjustStamps(0)
                }}
                className="px-2.5 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors"
              >
                Manual Adjust
              </button>
            )}
          </div>

          {loyalty && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 mb-4 space-y-2 text-sm">
              {showPointsRow && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{pointsLabel}</span>
                  <span className="font-semibold tabular-nums text-foreground">{loyalty.points}</span>
                </div>
              )}
              {showStampsRow && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Stamps</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {loyalty.stamps} / {stampsForReward}
                  </span>
                </div>
              )}
              {showVisitsRow && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Visits</span>
                  <span className="font-semibold tabular-nums text-foreground">{loyalty.total_visits}</span>
                </div>
              )}
              {showTierRow && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Tier</span>
                  <span className="font-semibold tabular-nums text-foreground">{loyalty.tier_level}</span>
                </div>
              )}
            </div>
          )}

          {adjustOpen && canManualAdjustLoyalty && (
            <div className="rounded-lg border border-border p-4 mb-4 space-y-3 bg-muted/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Points adjustment</label>
                  <input
                    type="number"
                    value={adjustPoints}
                    onChange={e => setAdjustPoints(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Stamps adjustment</label>
                  <input
                    type="number"
                    value={adjustStamps}
                    onChange={e => setAdjustStamps(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Note <span className="text-destructive">*</span>
                </label>
                <input
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  placeholder="Reason for adjustment"
                  className={inputCls}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustOpen(false)
                    setAdjustNote('')
                    setAdjustPoints(0)
                    setAdjustStamps(0)
                  }}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleLoyaltyAdjustSubmit()}
                  disabled={adjustSaving}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {adjustSaving ? 'Saving…' : 'Submit'}
                </button>
              </div>
            </div>
          )}

          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recent transactions</h3>
          {loyaltyTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No loyalty transactions yet.</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium">Date</th>
                    <th className="text-start px-4 py-3 font-medium">Type</th>
                    <th className="text-end px-4 py-3 font-medium">Points</th>
                    <th className="text-end px-4 py-3 font-medium">Stamps</th>
                    <th className="text-start px-4 py-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loyaltyTxs.map(tx => (
                    <tr key={tx.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground">{tx.type}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{tx.points_delta}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{tx.stamps_delta}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[12rem] truncate" title={tx.note ?? ''}>
                        {tx.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
