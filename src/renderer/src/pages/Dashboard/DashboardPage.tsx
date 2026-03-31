import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, Wrench, Package, TrendingUp, AlertCircle, DollarSign, CheckSquare, Clock, Truck, TriangleAlert, Car, CheckCircle, Database as DatabaseIcon, Banknote, Landmark, Sigma, ScrollText, PlusCircle, Building2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { formatCurrency, cn } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { getCurrencySymbol, getCurrencyCode } from '../../store/currencyStore'
import { useAuthStore } from '../../store/authStore'
import { usePermission } from '../../hooks/usePermission'

interface TaskSummary {
  total: number; pending: number; in_progress: number; done: number;
  overdue: number; due_today: number; deliveries_today: number
}

interface DashboardData {
  todaySalesCount: number
  todayRevenue: number
  monthRevenue: number
  monthExpenses: number
  monthGrossProfit: number
  monthNetProfit: number
  activeRepairs: number
  lowStock: number
  totalVehicles: number
  vehiclesInGarage: number
  vehiclesInGarageMechanical: number
  vehiclesInGarageProgramming: number
  readyForPickup: number
  readyForPickupMechanical: number
  readyForPickupProgramming: number
  activeJobCards: number
  activeJobCardsMechanical: number
  activeJobCardsProgramming: number
  salesTrend: Array<{ day: string; revenue: number; count: number }>
  topProducts: Array<{ product_name: string; total_qty: number; total_revenue: number }>
  urgentJobCards: Array<{
    job_number: string; priority: string; status: string; job_type: string; bay_number: string | null
    owner_name: string | null
    vehicle_make: string | null; vehicle_model: string | null; vehicle_year: number | null; vehicle_plate: string | null
  }>
  totalAssetsPurchase: number
}

function DeptBreakdown({ mechanical, programming }: { mechanical: number; programming: number }): JSX.Element {
  return (
    <p className="text-base font-bold text-foreground mt-0.5 leading-snug">
      <span className="text-muted-foreground font-normal text-sm">Mechanical:</span>{' '}
      {mechanical}
      <span className="text-muted-foreground mx-2">|</span>
      <span className="text-muted-foreground font-normal text-sm">Programming:</span>{' '}
      {programming}
    </p>
  )
}

type CashDatePreset = 'today' | 'week' | 'month' | 'all_time' | 'custom'
type CashWidgetPreset = 'today' | 'week' | 'month' | 'custom'

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangeForCashPreset(preset: CashDatePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date()
  if (preset === 'all_time') return {}
  if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
  if (preset === 'today') {
    const s = toYMD(now)
    return { from: s, to: s }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toYMD(start), to: toYMD(end) }
  }
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: toYMD(mon), to: toYMD(sun) }
}

function rangeForCashWidgetPreset(preset: CashWidgetPreset, customFrom: string, customTo: string): { from: string; to: string } {
  const r = rangeForCashPreset(preset, customFrom, customTo)
  if (r.from && r.to) return { from: r.from, to: r.to }
  const s = toYMD(new Date())
  return { from: s, to: s }
}

type DrawerSummary = {
  total_in: number
  total_out: number
  drawer_balance: number
  opening_total: number
  cash_sales_total: number
  other_in_total: number
}

type DrawerRow = {
  id: number
  business_date: string
  created_at: string
  direction: 'in' | 'out'
  amount: number
  entry_type: string
  note: string | null
  payment_id: number | null
}

function entryTypeLabel(t: (k: string, o?: { defaultValue: string }) => string, entryType: string): string {
  const key = `dashboard.cashDrawerEntry.${entryType}`
  const fallbacks: Record<string, string> = {
    opening_balance: 'Opening balance',
    sale_payment: 'Sale (cash)',
    manual_in: 'Cash in (manual)',
    withdrawal: 'Withdrawal',
    change_given: 'Change given',
    manual_out: 'Cash out (manual)',
  }
  return t(key, { defaultValue: fallbacks[entryType] ?? entryType })
}

function CashInHandWidget(): JSX.Element {
  const { t } = useTranslation()
  const canManage = usePermission('sales.create')
  const [preset, setPreset] = useState<CashDatePreset>('today')
  const [customFrom, setCustomFrom] = useState(() => toYMD(new Date()))
  const [customTo, setCustomTo] = useState(() => toYMD(new Date()))
  const [allLedger, setAllLedger] = useState<DrawerSummary | null>(null)
  const [periodLedger, setPeriodLedger] = useState<DrawerSummary | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logRows, setLogRows] = useState<DrawerRow[]>([])
  const [openingDate, setOpeningDate] = useState(() => toYMD(new Date()))
  const [openingAmount, setOpeningAmount] = useState('')
  const [outAmount, setOutAmount] = useState('')
  const [outType, setOutType] = useState<'withdrawal' | 'manual_out'>('withdrawal')
  const [outNote, setOutNote] = useState('')
  const [inAmount, setInAmount] = useState('')
  const [inNote, setInNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const range = useMemo(() => rangeForCashPreset(preset, customFrom, customTo), [preset, customFrom, customTo])

  const reload = useCallback(async (): Promise<void> => {
    const rangeFilters = preset === 'all_time' || !range.from || !range.to ? {} : { from: range.from, to: range.to }
    const [allRes, periodRes] = await Promise.all([
      window.electronAPI.cashDrawer.summary({}),
      window.electronAPI.cashDrawer.summary(rangeFilters),
    ])
    if (allRes.success && allRes.data) setAllLedger(allRes.data)
    if (periodRes.success && periodRes.data) setPeriodLedger(periodRes.data)
  }, [preset, range.from, range.to])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!logOpen) return
    let cancel = false
    void (async () => {
      const res = await window.electronAPI.cashDrawer.list({
        ...(preset === 'all_time' || !range.from || !range.to ? {} : { from: range.from, to: range.to }),
        limit: 300,
      })
      if (!cancel && res.success && res.data) setLogRows(res.data as DrawerRow[])
    })()
    return () => { cancel = true }
  }, [logOpen, preset, customFrom, customTo, range.from, range.to])

  const presetBtn = (p: CashDatePreset, label: string) => (
    <button
      key={p}
      type="button"
      onClick={() => setPreset(p)}
      className={cn(
        'px-2 py-1 text-xs font-medium rounded-md border transition-colors',
        preset === p
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
    >
      {label}
    </button>
  )

  const periodLabel =
    preset === 'all_time'
      ? t('dashboard.cashAllTime', { defaultValue: 'All time' })
      : range.from && range.to
        ? range.from === range.to
          ? range.from
          : `${range.from} → ${range.to}`
        : ''

  const onSetOpening = async (): Promise<void> => {
    const amt = parseFloat(openingAmount.replace(',', '.'))
    if (Number.isNaN(amt) || amt < 0) {
      setMsg(t('dashboard.cashDrawerInvalidAmount', { defaultValue: 'Enter a valid amount (0 or more).' }))
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await window.electronAPI.cashDrawer.setOpening({ businessDate: openingDate, amount: amt })
    setBusy(false)
    if (!res.success) {
      setMsg(res.error ?? t('dashboard.cashDrawerError', { defaultValue: 'Could not save.' }))
      return
    }
    setOpeningAmount('')
    await reload()
  }

  const onAddOut = async (): Promise<void> => {
    const amt = parseFloat(outAmount.replace(',', '.'))
    if (Number.isNaN(amt) || amt <= 0) {
      setMsg(t('dashboard.cashDrawerInvalidAmount', { defaultValue: 'Enter a valid amount (0 or more).' }))
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await window.electronAPI.cashDrawer.addManual({
      direction: 'out',
      amount: amt,
      entry_type: outType,
      note: outNote.trim() || undefined,
      business_date: toYMD(new Date()),
    })
    setBusy(false)
    if (!res.success) {
      setMsg(res.error ?? t('dashboard.cashDrawerError', { defaultValue: 'Could not save.' }))
      return
    }
    setOutAmount('')
    setOutNote('')
    await reload()
    if (logOpen) {
      const lr = await window.electronAPI.cashDrawer.list({
        ...(preset === 'all_time' || !range.from || !range.to ? {} : { from: range.from, to: range.to }),
        limit: 300,
      })
      if (lr.success && lr.data) setLogRows(lr.data as DrawerRow[])
    }
  }

  const onAddIn = async (): Promise<void> => {
    const amt = parseFloat(inAmount.replace(',', '.'))
    if (Number.isNaN(amt) || amt <= 0) {
      setMsg(t('dashboard.cashDrawerInvalidAmount', { defaultValue: 'Enter a valid amount (0 or more).' }))
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await window.electronAPI.cashDrawer.addManual({
      direction: 'in',
      amount: amt,
      entry_type: 'manual_in',
      note: inNote.trim() || undefined,
      business_date: toYMD(new Date()),
    })
    setBusy(false)
    if (!res.success) {
      setMsg(res.error ?? t('dashboard.cashDrawerError', { defaultValue: 'Could not save.' }))
      return
    }
    setInAmount('')
    setInNote('')
    await reload()
    if (logOpen) {
      const lr = await window.electronAPI.cashDrawer.list({
        ...(preset === 'all_time' || !range.from || !range.to ? {} : { from: range.from, to: range.to }),
        limit: 300,
      })
      if (lr.success && lr.data) setLogRows(lr.data as DrawerRow[])
    }
  }

  const period = periodLedger
  const drawerAllTime = allLedger?.drawer_balance ?? 0

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 shrink-0">
          <Banknote className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {t('dashboard.cashInHand', { defaultValue: 'Cash in hand' })}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('dashboard.cashInHandDrawerSub', { defaultValue: 'Drawer balance (all recorded cash ledger)' })}
          </p>
          <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight"><CurrencyText amount={drawerAllTime} symbol=" د.إ" /></p>
          {period && preset !== 'all_time' && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              <span className="font-medium text-foreground/80">{periodLabel}</span>
              {': '}
              {t('dashboard.cashDrawerInShort', { defaultValue: 'In' })} <CurrencyText amount={period.total_in} symbol=" د.إ" />
              {' · '}
              {t('dashboard.cashDrawerOutShort', { defaultValue: 'Out' })} <CurrencyText amount={period.total_out} symbol=" د.إ" />
              {' · '}
              {t('dashboard.cashDrawerNetShort', { defaultValue: 'Net' })} <CurrencyText amount={period.drawer_balance} symbol=" د.إ" />
            </p>
          )}
          {period && preset === 'today' && (
            <p className="text-[11px] text-foreground/90 mt-1 font-medium">
              {t('dashboard.cashDrawerTodayRegister', { defaultValue: "Today's register" })}
              {': '}
              {t('dashboard.cashDrawerOpeningShort', { defaultValue: 'Opening' })} <CurrencyText amount={period.opening_total} symbol=" د.إ" />
              {' · '}
              {t('dashboard.cashDrawerRunningShort', { defaultValue: 'Running total' })} <CurrencyText amount={period.drawer_balance} symbol=" د.إ" />
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {presetBtn('today', t('dashboard.cashToday', { defaultValue: 'Today' }))}
        {presetBtn('week', t('dashboard.cashThisWeek', { defaultValue: 'This Week' }))}
        {presetBtn('month', t('dashboard.cashThisMonth', { defaultValue: 'This Month' }))}
        {presetBtn('all_time', t('dashboard.cashAllTime', { defaultValue: 'All time' }))}
        {presetBtn('custom', t('dashboard.cashCustom', { defaultValue: 'Custom' }))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="flex-1 min-w-[8rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
          />
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="flex-1 min-w-[8rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/60"
        >
          <ScrollText className="w-3.5 h-3.5" />
          {t('dashboard.cashDrawerLog', { defaultValue: 'Transaction log' })}
        </button>
      </div>

      {canManage && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {t('dashboard.cashDrawerRegister', { defaultValue: 'Cash register' })}
          </p>
          {msg && <p className="text-xs text-destructive">{msg}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border p-2 space-y-1.5">
              <p className="text-xs font-medium text-foreground">{t('dashboard.cashDrawerOpening', { defaultValue: 'Opening balance (start of day)' })}</p>
              <div className="flex flex-wrap gap-1">
                <input
                  type="date"
                  value={openingDate}
                  onChange={e => setOpeningDate(e.target.value)}
                  className="flex-1 min-w-[7rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
                  disabled={busy}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={t('dashboard.cashDrawerAmount', { defaultValue: 'Amount' })}
                  value={openingAmount}
                  onChange={e => setOpeningAmount(e.target.value)}
                  className="w-24 px-2 py-1 text-xs border border-input rounded-md bg-background"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void onSetOpening()}
                  disabled={busy}
                  className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {t('dashboard.cashDrawerSaveOpening', { defaultValue: 'Set' })}
                </button>
              </div>
            </div>
            <div className="rounded-md border border-border p-2 space-y-1.5">
              <p className="text-xs font-medium text-foreground">{t('dashboard.cashDrawerCashOut', { defaultValue: 'Cash out' })}</p>
              <div className="flex flex-wrap gap-1 items-center">
                <select
                  value={outType}
                  onChange={e => setOutType(e.target.value as typeof outType)}
                  className="px-2 py-1 text-xs border border-input rounded-md bg-background max-w-[11rem]"
                  disabled={busy}
                >
                  <option value="withdrawal">{t('dashboard.cashDrawerWithdrawal', { defaultValue: 'Withdrawal' })}</option>
                  <option value="manual_out">{t('dashboard.cashDrawerManualOut', { defaultValue: 'Other out' })}</option>
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={t('dashboard.cashDrawerAmount', { defaultValue: 'Amount' })}
                  value={outAmount}
                  onChange={e => setOutAmount(e.target.value)}
                  className="w-20 px-2 py-1 text-xs border border-input rounded-md bg-background"
                  disabled={busy}
                />
                <input
                  type="text"
                  placeholder={t('dashboard.cashDrawerNotePh', { defaultValue: 'Note' })}
                  value={outNote}
                  onChange={e => setOutNote(e.target.value)}
                  className="flex-1 min-w-[6rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void onAddOut()}
                  disabled={busy}
                  className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                  <PlusCircle className="w-3 h-3" />
                  {t('dashboard.cashDrawerAdd', { defaultValue: 'Add' })}
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border p-2 space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t('dashboard.cashDrawerManualIn', { defaultValue: 'Cash in (manual)' })}</p>
            <div className="flex flex-wrap gap-1 items-center">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t('dashboard.cashDrawerAmount', { defaultValue: 'Amount' })}
                value={inAmount}
                onChange={e => setInAmount(e.target.value)}
                className="w-24 px-2 py-1 text-xs border border-input rounded-md bg-background"
                disabled={busy}
              />
              <input
                type="text"
                placeholder={t('dashboard.cashDrawerNotePh', { defaultValue: 'Note' })}
                value={inNote}
                onChange={e => setInNote(e.target.value)}
                className="flex-1 min-w-[8rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void onAddIn()}
                disabled={busy}
                className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                <PlusCircle className="w-3 h-3" />
                {t('dashboard.cashDrawerAdd', { defaultValue: 'Add' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="text-sm font-semibold">{t('dashboard.cashDrawerLogTitle', { defaultValue: 'Cash ledger' })}</h4>
              <button type="button" onClick={() => setLogOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
                {t('common.close', { defaultValue: 'Close' })}
              </button>
            </div>
            <div className="overflow-auto flex-1 p-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-2">{t('dashboard.cashDrawerColWhen', { defaultValue: 'When' })}</th>
                    <th className="py-1.5 pr-2">{t('dashboard.cashDrawerColType', { defaultValue: 'Type' })}</th>
                    <th className="py-1.5 pr-2 text-right">{t('dashboard.cashDrawerColAmount', { defaultValue: 'Amount' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.map(row => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">
                        {row.created_at?.replace('T', ' ').slice(0, 19) ?? row.business_date}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className={row.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {row.direction === 'in' ? 'In' : 'Out'}
                        </span>
                        {' · '}
                        {entryTypeLabel(t, row.entry_type)}
                        {row.note ? (
                          <span className="block text-[10px] text-muted-foreground truncate max-w-[14rem]" title={row.note}>
                            {row.note}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums"><CurrencyText amount={row.amount} symbol=" د.إ" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logRows.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">{t('dashboard.cashDrawerLogEmpty', { defaultValue: 'No entries in this range.' })}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CashFlowWidget({
  title,
  subtitle,
  icon: Icon,
  valueKey,
}: {
  title: string
  subtitle?: string
  icon: React.ElementType
  valueKey: 'cash' | 'non_cash' | 'total'
}): JSX.Element {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<CashWidgetPreset>('today')
  const [customFrom, setCustomFrom] = useState(() => toYMD(new Date()))
  const [customTo, setCustomTo] = useState(() => toYMD(new Date()))
  const [totals, setTotals] = useState({ cash: 0, non_cash: 0, total: 0 })

  const { from, to } = useMemo(() => rangeForCashWidgetPreset(preset, customFrom, customTo), [preset, customFrom, customTo])

  useEffect(() => {
    let cancelled = false
    window.electronAPI.reports.cashByMethod(from, to).then(res => {
      if (cancelled || !res.success || !res.data) return
      setTotals(res.data)
    })
    return () => { cancelled = true }
  }, [from, to])

  const value = valueKey === 'cash' ? totals.cash : valueKey === 'non_cash' ? totals.non_cash : totals.total

  const presetBtn = (p: CashWidgetPreset, label: string) => (
    <button
      key={p}
      type="button"
      onClick={() => setPreset(p)}
      className={cn(
        'px-2 py-1 text-xs font-medium rounded-md border transition-colors',
        preset === p
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight"><CurrencyText amount={value} symbol=" د.إ" /></p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">AED · {from === to ? from : `${from} → ${to}`}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {presetBtn('today', t('dashboard.cashToday', { defaultValue: 'Today' }))}
        {presetBtn('week', t('dashboard.cashThisWeek', { defaultValue: 'This Week' }))}
        {presetBtn('month', t('dashboard.cashThisMonth', { defaultValue: 'This Month' }))}
        {presetBtn('custom', t('dashboard.cashCustom', { defaultValue: 'Custom' }))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="flex-1 min-w-[8rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
          />
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="flex-1 min-w-[8rem] px-2 py-1 text-xs border border-input rounded-md bg-background"
          />
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, valueContent, sub, color }: {
  icon: React.ElementType
  label: string
  value?: string | number
  valueContent?: React.ReactNode
  sub?: string
  color: string
}): JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex items-start gap-4">
      <div className={`flex items-center justify-center w-11 h-11 rounded-lg ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        {valueContent ?? <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage(): JSX.Element {
  const { t } = useTranslation()
  const { role } = useAuthStore()
  const canTasks = usePermission('tasks.view')
  const canAssets = usePermission('assets.view')
  const isPrivileged = ['owner', 'manager'].includes(role ?? '')
  const [data, setData] = useState<DashboardData | null>(null)
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.dashboard.getSummary().then(res => {
      if (res.success) setData(res.data as DashboardData)
      setLoading(false)
    })
    if (canTasks) {
      window.electronAPI.tasks.getSummary().then(res => {
        if (res.success) setTaskSummary(res.data as TaskSummary)
      })
    }
  }, [canTasks])

  if (loading) return (
    <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('dashboard.title')}</h1>

      {/* Stats Row 1 — Garage Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={Car} label={t('dashboard.vehiclesInGarage')}
          valueContent={(
            <DeptBreakdown
              mechanical={data?.vehiclesInGarageMechanical ?? 0}
              programming={data?.vehiclesInGarageProgramming ?? 0}
            />
          )}
          sub={t('dashboard.activeRepairsLabel')}
          color="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400" />
        <StatCard icon={CheckCircle} label={t('dashboard.readyForPickup')}
          valueContent={(
            <DeptBreakdown
              mechanical={data?.readyForPickupMechanical ?? 0}
              programming={data?.readyForPickupProgramming ?? 0}
            />
          )}
          sub={t('dashboard.completedJobs')}
          color="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400" />
        <StatCard icon={Wrench} label={t('dashboard.activeJobCards')}
          valueContent={(
            <DeptBreakdown
              mechanical={data?.activeJobCardsMechanical ?? 0}
              programming={data?.activeJobCardsProgramming ?? 0}
            />
          )}
          sub={t('dashboard.inProgress')}
          color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" />
        <StatCard icon={DatabaseIcon} label={t('dashboard.totalVehicles')}
          value={data?.totalVehicles ?? 0}
          sub={t('dashboard.inSystem')}
          color="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400" />
      </div>

      {/* Stats Row 2 — Sales & Stock */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={ShoppingCart} label={t('dashboard.todaySales')}
          valueContent={<CurrencyText amount={data?.todayRevenue ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
          sub={`${data?.todaySalesCount ?? 0} transactions · ${getCurrencyCode()}`}
          color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" />
        <StatCard icon={TrendingUp} label={t('dashboard.monthRevenue')}
          valueContent={<CurrencyText amount={data?.monthRevenue ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
          sub={getCurrencyCode()}
          color="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400" />
        <StatCard icon={Package} label={t('dashboard.lowStock')}
          value={data?.lowStock ?? 0}
          color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
      </div>

      {/* Stats Row 3 — Financials */}
      <div className={cn('grid grid-cols-1 gap-4 mb-8', canAssets ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <StatCard icon={TrendingUp} label={t('dashboard.grossProfit')}
          valueContent={<CurrencyText amount={data?.monthGrossProfit ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
          sub={`${t('dashboard.thisMonth')} · ${getCurrencyCode()}`}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" />
        <StatCard icon={DollarSign} label={t('dashboard.monthExpenses')}
          valueContent={<CurrencyText amount={data?.monthExpenses ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
          sub={`${t('dashboard.thisMonth')} · ${getCurrencyCode()}`}
          color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
        <StatCard icon={DollarSign} label={t('dashboard.netProfit')}
          valueContent={<CurrencyText amount={data?.monthNetProfit ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
          sub={`${t('dashboard.thisMonth')} · ${getCurrencyCode()}`}
          color={(data?.monthNetProfit ?? 0) >= 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'} />
        {canAssets && (
          <StatCard icon={Building2} label={t('dashboard.totalAssets', { defaultValue: 'Total assets' })}
            valueContent={<CurrencyText amount={data?.totalAssetsPurchase ?? 0} className="text-2xl font-bold text-foreground mt-0.5" />}
            sub={t('dashboard.totalAssetsSub', { defaultValue: 'Sum of purchase prices · ' }) + getCurrencyCode()}
            color="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" />
        )}
      </div>

      {/* Cash receipts (POS payments + custom receipts); each widget has its own date range. */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-foreground mb-3">{t('dashboard.cashWidgetsTitle', { defaultValue: 'Cash & receipts' })}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('dashboard.cashWidgetsHint', { defaultValue: 'Totals from recorded payment methods (Quick Invoice). Job-card-only deposits are not split by method until recorded as payments.' })}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CashInHandWidget />
          <CashFlowWidget
            icon={Landmark}
            title={t('dashboard.bankTransfer', { defaultValue: 'Bank transfer' })}
            subtitle={t('dashboard.bankTransferSub', { defaultValue: 'Non-cash: card, transfer, mobile, other' })}
            valueKey="non_cash"
          />
          <CashFlowWidget
            icon={Sigma}
            title={t('dashboard.cashTotal', { defaultValue: 'Total' })}
            subtitle={t('dashboard.cashTotalSub', { defaultValue: 'Cash + non-cash' })}
            valueKey="total"
          />
        </div>
      </div>

      {/* Stats Row 4 — Tasks (role-aware) */}
      {canTasks && taskSummary && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            {isPrivileged ? t('dashboard.taskOverview') : t('dashboard.myTasks')}
          </h2>
          {isPrivileged ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={CheckSquare} label={t('dashboard.totalTasks')} value={taskSummary.total}
                color="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400" />
              <StatCard icon={TriangleAlert} label={t('dashboard.overdueTasks')} value={taskSummary.overdue}
                color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
              <StatCard icon={Clock} label={t('dashboard.dueTodayTasks')} value={taskSummary.due_today}
                color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" />
              <StatCard icon={Truck} label={t('dashboard.deliveriesToday')} value={taskSummary.deliveries_today}
                color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Clock} label={t('dashboard.myTasksToday')} value={taskSummary.due_today}
                color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" />
              <StatCard icon={TriangleAlert} label={t('dashboard.myOverdue')} value={taskSummary.overdue}
                color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">{t('dashboard.salesTrend')}</h2>
          {(data?.salesTrend?.length ?? 0) === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{t('common.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={data?.salesTrend}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${getCurrencySymbol()}${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revenueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">{t('dashboard.topProducts')}</h2>
          {(data?.topProducts?.length ?? 0) === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{t('common.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart data={data?.topProducts?.slice(0, 5)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="product_name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="total_qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Urgent job cards */}
      {(data?.urgentJobCards?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <h2 className="font-semibold text-foreground">{t('dashboard.urgentJobs')}</h2>
          </div>
          <div className="space-y-2">
            {data?.urgentJobCards?.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{r.job_number}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-sm text-foreground">{r.owner_name ?? 'Walk-in'}</span>
                  {(r.vehicle_make || r.vehicle_model) && (
                    <span className="text-sm text-muted-foreground ml-2">
                      — {[r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ')}
                      {r.vehicle_plate && <span className="ml-1 font-mono">({r.vehicle_plate})</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.bay_number && <span className="text-xs font-mono text-muted-foreground">{r.bay_number}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400'}`}>{r.priority}</span>
                  <span className="text-xs text-muted-foreground">{r.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
