import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileText, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { formatCurrency, formatDate } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { FeatureGate } from '../../components/FeatureGate'
import { toast } from 'sonner'
import {
  buildDailySalesPdf,
  buildProfitPdf,
  buildTopServicesPdf,
} from '../../utils/reportPdfTemplate'

type ReportTab = 'sales' | 'profit' | 'department_reports' | 'inventory' | 'lowstock' | 'topproducts' | 'debts' | 'expenses_category' | 'expenses_monthly' | 'assets'
type ReportDept = 'all' | 'mechanical' | 'programming'
type DepartmentPreset = 'today' | 'week' | 'month' | 'custom'

const today = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage(): JSX.Element {
  return (
    <FeatureGate feature="reports.view">
      <ReportsPageInner />
    </FeatureGate>
  )
}

function ReportsPageInner(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ReportTab>('sales')
  const [dateFrom, setDateFrom] = useState(monthAgo)
  const [dateTo, setDateTo] = useState(today)
  const [reportDept, setReportDept] = useState<ReportDept>('all')
  const [data, setData] = useState<unknown[]>([])
  const [departmentData, setDepartmentData] = useState<{
    mechanical: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
    programming: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
  } | null>(null)
  const [departmentPreset, setDepartmentPreset] = useState<DepartmentPreset>('month')
  const [assetsFooter, setAssetsFooter] = useState<{ total_purchase: number; total_current: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportPeriod, setExportPeriod] = useState<'weekly' | 'monthly' | 'custom'>('monthly')
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exportWeekDate, setExportWeekDate] = useState('')
  const [exportDepartment, setExportDepartment] = useState<'mechanical' | 'programming' | 'both'>('both')

  async function handleExportPdf(
    period: 'weekly' | 'monthly' | 'custom',
    dateFrom: string,
    dateTo: string,
    department: 'mechanical' | 'programming' | 'both',
    weekDate?: string,
  ): Promise<void> {
    const toYmd = (d: Date): string => d.toISOString().slice(0, 10)
    let resolvedFrom = dateFrom
    let resolvedTo = dateTo

    if (period === 'weekly') {
      const base = weekDate && weekDate.trim() ? new Date(weekDate) : new Date()
      const day = base.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(base)
      monday.setDate(base.getDate() + diff)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      resolvedFrom = toYmd(monday)
      resolvedTo = toYmd(sunday)
    } else if (period === 'monthly') {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      resolvedFrom = toYmd(start)
      resolvedTo = toYmd(end)
    } else if (period === 'custom') {
      if (!dateFrom || !dateTo) {
        toast.error('Please select both From and To dates')
        return
      }
      resolvedFrom = dateFrom
      resolvedTo = dateTo
    }

    const storeRes = await window.electronAPI.settings.get('store_name')
    const storeName = (storeRes?.success ? storeRes.data : null) ?? 'Mahali Garage'
    const currencyRes = await window.electronAPI.settings.get('currency')
    const currency = (currencyRes?.success ? currencyRes.data : null) ?? 'AED'

    const depts: Array<'Mechanical' | 'Programming'> = department === 'both'
      ? ['Mechanical', 'Programming']
      : department === 'mechanical'
        ? ['Mechanical']
        : ['Programming']

    setExportingPdf(true)
    try {
      const topProductsRes = tab === 'topproducts'
        ? await window.electronAPI.reports.topProducts(resolvedFrom, resolvedTo)
        : null

      for (let i = 0; i < depts.length; i++) {
        const dept = depts[i]
        const deptParam = dept.toLowerCase() as 'mechanical' | 'programming'
        let html = ''

        if (tab === 'sales') {
          const salesRes = await window.electronAPI.reports.salesDaily(resolvedFrom, resolvedTo, deptParam)
          if (!salesRes?.success) throw new Error(salesRes?.error || 'Failed to load daily sales data')
          const salesRows = (salesRes.data as Array<{
            sale_number: string
            customer_name: string | null
            total_amount: number
            status: string
          }> | undefined) ?? []

          html = buildDailySalesPdf({
            storeName,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            rows: salesRows.map((row) => ({
              invoice: row.sale_number,
              customer: row.customer_name ?? 'Walk-in',
              car: '—',
              amount: row.total_amount,
              status: row.status,
            })),
            currency,
          })
        } else if (tab === 'profit') {
          const profitRes = await window.electronAPI.reports.profit(resolvedFrom, resolvedTo, deptParam)
          if (!profitRes?.success) throw new Error(profitRes?.error || 'Failed to load profit data')
          const profitRows = (profitRes.data as Array<{
            revenue: number
            cogs: number
            gross_profit: number
          }> | undefined) ?? []

          const totalRevenue = profitRows.reduce((sum, row) => sum + row.revenue, 0)
          const totalCost = profitRows.reduce((sum, row) => sum + row.cogs, 0)
          const grossProfit = profitRows.reduce((sum, row) => sum + row.gross_profit, 0)
          const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

          html = buildProfitPdf({
            storeName,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            totalRevenue,
            totalCost,
            grossProfit,
            marginPercent,
            currency,
          })
        } else if (tab === 'topproducts') {
          if (!topProductsRes?.success) throw new Error(topProductsRes?.error || 'Failed to load top products data')
          const topRows = ((topProductsRes.data as Array<{
            product_name: string
            total_qty: number
            total_revenue: number
          }> | undefined) ?? [])
            .slice()
            .sort((a, b) => b.total_revenue - a.total_revenue)

          html = buildTopServicesPdf({
            storeName,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            rows: topRows.map((row, idx) => ({
              rank: idx + 1,
              serviceName: row.product_name,
              count: row.total_qty,
              revenue: row.total_revenue,
            })),
            currency,
          })
        } else {
          throw new Error('PDF export is only supported for Sales, Profit, and Top Products tabs')
        }

        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')

        if (depts.length > 1 && i < depts.length - 1) {
          await new Promise((r) => setTimeout(r, 600))
        }
      }

      setShowExportModal(false)
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Failed to export PDF'
      toast.error(msg)
    } finally {
      setExportingPdf(false)
    }
  }

  const applyDepartmentPreset = (preset: DepartmentPreset): void => {
    const now = new Date()
    const toYmd = (d: Date): string => d.toISOString().slice(0, 10)
    if (preset === 'today') {
      const d = toYmd(now)
      setDateFrom(d); setDateTo(d)
      return
    }
    if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setDateFrom(toYmd(start)); setDateTo(toYmd(end))
      return
    }
    if (preset === 'week') {
      const day = now.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const start = new Date(now)
      start.setDate(now.getDate() + diff)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      setDateFrom(toYmd(start)); setDateTo(toYmd(end))
    }
  }

  const load = async () => {
    setLoading(true)
    setData([])
    setDepartmentData(null)
    setAssetsFooter(null)
    try {
      let res
      if (tab === 'sales') res = await window.electronAPI.reports.salesDaily(dateFrom, dateTo, reportDept)
      else if (tab === 'profit') res = await window.electronAPI.reports.profit(dateFrom, dateTo, reportDept)
      else if (tab === 'inventory') res = await window.electronAPI.reports.inventory()
      else if (tab === 'lowstock') res = await window.electronAPI.reports.lowStock()
      else if (tab === 'topproducts') res = await window.electronAPI.reports.topProducts(dateFrom, dateTo)
      else if (tab === 'debts') res = await window.electronAPI.reports.customerDebts(reportDept)
      else if (tab === 'expenses_category') res = await window.electronAPI.expenses.sumByCategory(dateFrom, dateTo, reportDept)
      else if (tab === 'expenses_monthly') res = await window.electronAPI.expenses.sumByMonth(parseInt(dateFrom.slice(0, 4)), reportDept)
      else if (tab === 'department_reports') {
        res = await window.electronAPI.reports.departmentSummary(dateFrom, dateTo)
        if (res?.success && res.data) {
          setDepartmentData(res.data as {
            mechanical: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
            programming: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
          })
        }
        return
      }
      else if (tab === 'assets') {
        res = await window.electronAPI.reports.assets()
        if (res?.success && res.data) {
          const d = res.data as { rows: unknown[]; total_purchase: number; total_current: number }
          setData(d.rows)
          setAssetsFooter({ total_purchase: d.total_purchase, total_current: d.total_current })
        }
        return
      }
      if (res?.success) setData(res.data as unknown[])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tab, dateFrom, dateTo, reportDept])

  const TABS: Array<{ key: ReportTab; label: string }> = [
    { key: 'sales',       label: t('reports.salesDaily') },
    { key: 'profit',      label: t('reports.profit') },
    { key: 'department_reports', label: t('reports.departmentReports', { defaultValue: 'Department Reports' }) },
    { key: 'inventory',   label: t('reports.inventory') },
    { key: 'lowstock',    label: t('reports.lowStock') },
    { key: 'topproducts', label: t('reports.topProducts') },
    { key: 'debts',              label: t('reports.customerDebts') },
    { key: 'expenses_category',  label: t('reports.expensesCategory') },
    { key: 'expenses_monthly',   label: t('reports.expensesMonthly') },
    { key: 'assets',            label: t('reports.assetsReport', { defaultValue: 'Assets' }) },
  ]

  const showDateRange = ['sales', 'profit', 'topproducts', 'expenses_category', 'expenses_monthly', 'department_reports'].includes(tab)
  const showDeptFilter = ['sales', 'profit', 'debts', 'expenses_category', 'expenses_monthly'].includes(tab)
  const canExportPdf = ['sales', 'profit', 'topproducts'].includes(tab)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
        <div className="flex items-center gap-2">
          {canExportPdf && (
            <button onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
              <FileText className="w-4 h-4" />Export PDF
            </button>
          )}
          <button onClick={() => exportCsv(data as Record<string, unknown>[], `${tab}-report.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
            <Download className="w-4 h-4" />{t('reports.exportCsv')}
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => { setData([]); setLoading(true); setTab(tb.key) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Date range */}
      {showDateRange && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {tab === 'department_reports' && (
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              {([
                ['today', t('reports.today', { defaultValue: 'Today' })],
                ['week', t('reports.thisWeek', { defaultValue: 'This Week' })],
                ['month', t('reports.thisMonth', { defaultValue: 'This Month' })],
                ['custom', t('reports.customRange', { defaultValue: 'Custom Range' })],
              ] as Array<[DepartmentPreset, string]>).map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() => { setDepartmentPreset(preset); if (preset !== 'custom') applyDepartmentPreset(preset) }}
                  className={`px-2.5 py-1 text-xs rounded ${departmentPreset === preset ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t('common.from')}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t('common.to')}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {showDeptFilter && (
            <div className="flex items-center gap-2 ms-auto">
              <label className="text-sm text-muted-foreground whitespace-nowrap">{t('reports.department', { defaultValue: 'Department' })}</label>
              <select
                value={reportDept}
                onChange={e => setReportDept(e.target.value as ReportDept)}
                className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">{t('common.all')}</option>
                <option value="mechanical">{t('reports.dept.mechanical', { defaultValue: 'Mechanical' })}</option>
                <option value="programming">{t('reports.dept.programming', { defaultValue: 'Programming' })}</option>
              </select>
            </div>
          )}
        </div>
      )}

      {showDeptFilter && !showDateRange && (
        <div className="flex items-center gap-2 mb-4">
          <label className="text-sm text-muted-foreground">{t('reports.department', { defaultValue: 'Department' })}</label>
          <select
            value={reportDept}
            onChange={e => setReportDept(e.target.value as ReportDept)}
            className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t('common.all')}</option>
            <option value="mechanical">{t('reports.dept.mechanical', { defaultValue: 'Mechanical' })}</option>
            <option value="programming">{t('reports.dept.programming', { defaultValue: 'Programming' })}</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <>
          {/* Chart */}
          {tab === 'sales' && data.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data as Array<Record<string, unknown>>}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="created_at" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5, 10) ?? d} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total_amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'profit' && data.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data as Array<Record<string, unknown>>}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="gross_profit" stroke="#22c55e" strokeWidth={2} name="Profit" />
                  <Line type="monotone" dataKey="cogs" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" name="COGS" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {tab === 'expenses_category' && data.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data as Array<Record<string, unknown>>} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <YAxis dataKey="category_name" type="category" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'expenses_monthly' && data.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data as Array<Record<string, unknown>>}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {tab === 'department_reports' && departmentData ? (
            <DepartmentReportsPanel
              mechanical={departmentData.mechanical}
              programming={departmentData.programming}
            />
          ) : (
            <ReportTable tab={tab} data={data} reportDept={reportDept} assetsFooter={assetsFooter} />
          )}
        </>
      )}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Export PDF Report</h2>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-md hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Time Period</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {([
                  ['weekly', 'Weekly'],
                  ['monthly', 'Monthly'],
                  ['custom', 'Custom'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-period"
                      value={value}
                      checked={exportPeriod === value}
                      onChange={() => setExportPeriod(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {exportPeriod === 'weekly' && (
                <div className="mt-3">
                  <label className="block text-xs text-muted-foreground mb-1">Pick any day in the week</label>
                  <input
                    type="date"
                    value={exportWeekDate}
                    onChange={e => setExportWeekDate(e.target.value)}
                    className="border border-border rounded-md px-2 py-1.5 text-sm bg-background w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">The full Mon–Sun week will be exported</p>
                </div>
              )}
              {exportPeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">From</label>
                    <input
                      type="date"
                      value={exportDateFrom}
                      onChange={e => setExportDateFrom(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">To</label>
                    <input
                      type="date"
                      value={exportDateTo}
                      onChange={e => setExportDateTo(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mb-5">
              <p className="text-sm font-medium mb-2">Department</p>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-department"
                    value="mechanical"
                    checked={exportDepartment === 'mechanical'}
                    onChange={() => setExportDepartment('mechanical')}
                  />
                  <span>Mechanical</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-department"
                    value="programming"
                    checked={exportDepartment === 'programming'}
                    onChange={() => setExportDepartment('programming')}
                  />
                  <span>Programming</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-department"
                    value="both"
                    checked={exportDepartment === 'both'}
                    onChange={() => setExportDepartment('both')}
                  />
                  <span>Both</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">(generates 2 files)</p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => {
                  setExportingPdf(true)
                  void handleExportPdf(exportPeriod, exportDateFrom, exportDateTo, exportDepartment, exportWeekDate).finally(() => {
                    setExportingPdf(false)
                  })
                  setShowExportModal(false)
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {exportingPdf ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DepartmentReportsPanel({
  mechanical,
  programming,
}: {
  mechanical: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
  programming: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> }
}): JSX.Element {
  const { t } = useTranslation()
  const panel = (
    title: string,
    tone: string,
    data: { revenue: number; cost: number; gross_profit: number; jobs_count: number; top_services: Array<{ service_name: string; total_qty: number; total_revenue: number }> },
  ) => (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className={`px-4 py-3 border-b border-border ${tone}`}>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-border p-3">
            <p className="text-muted-foreground">{t('reports.revenue')}</p>
            <p className="font-bold"><CurrencyText amount={data.revenue} /></p>
          </div>
          <div className="rounded border border-border p-3">
            <p className="text-muted-foreground">{t('reports.cogs', { defaultValue: 'Total Cost' })}</p>
            <p className="font-bold"><CurrencyText amount={data.cost} /></p>
          </div>
          <div className="rounded border border-border p-3">
            <p className="text-muted-foreground">{t('reports.grossProfit')}</p>
            <p className="font-bold"><CurrencyText amount={data.gross_profit} /></p>
          </div>
          <div className="rounded border border-border p-3">
            <p className="text-muted-foreground">{t('reports.jobsCount', { defaultValue: 'Jobs/Receipts' })}</p>
            <p className="font-bold">{data.jobs_count}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">{t('reports.topServices', { defaultValue: 'Top Services' })}</p>
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-start px-3 py-2 font-medium">{t('common.name')}</th>
                  <th className="text-end px-3 py-2 font-medium">Qty</th>
                  <th className="text-end px-3 py-2 font-medium">{t('reports.revenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.top_services.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No data</td></tr>
                ) : (
                  data.top_services.map((s, idx) => (
                    <tr key={`${s.service_name}-${idx}`}>
                      <td className="px-3 py-2">{s.service_name}</td>
                      <td className="px-3 py-2 text-end">{s.total_qty}</td>
                      <td className="px-3 py-2 text-end"><CurrencyText amount={s.total_revenue} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {panel(t('reports.dept.mechanical', { defaultValue: 'Mechanical' }), 'bg-amber-50 dark:bg-amber-950/20', mechanical)}
      {panel(t('reports.dept.programming', { defaultValue: 'Programming' }), 'bg-violet-50 dark:bg-violet-950/20', programming)}
    </div>
  )
}

function ReportTable({ tab, data, reportDept, assetsFooter }: {
  tab: ReportTab
  data: unknown[]
  reportDept: ReportDept
  assetsFooter: { total_purchase: number; total_current: number } | null
}): JSX.Element {
  const { t } = useTranslation()
  if (tab === 'assets') {
    type AssetR = { name: string; category: string; purchase_date: string; purchase_price: number; current_value: number | null; description: string | null }
    const rows = data as AssetR[]
    if (rows.length === 0 && !assetsFooter) {
      return <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
    }
    const tp = assetsFooter?.total_purchase ?? rows.reduce((s, r) => s + r.purchase_price, 0)
    const tc = assetsFooter?.total_current ?? rows.reduce((s, r) => s + (r.current_value ?? 0), 0)
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
              <th className="text-start px-4 py-3 font-medium">{t('assets.category', { defaultValue: 'Category' })}</th>
              <th className="text-start px-4 py-3 font-medium">{t('assets.purchaseDate', { defaultValue: 'Purchase date' })}</th>
              <th className="text-end px-4 py-3 font-medium">{t('assets.purchasePrice', { defaultValue: 'Purchase price' })}</th>
              <th className="text-end px-4 py-3 font-medium">{t('assets.currentValue', { defaultValue: 'Current value' })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(r.purchase_date)}</td>
                <td className="px-4 py-3 text-end tabular-nums"><CurrencyText amount={r.purchase_price} /></td>
                <td className="px-4 py-3 text-end tabular-nums">{r.current_value != null ? <CurrencyText amount={r.current_value} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-sm">
                {t('reports.assetsTotals', { defaultValue: 'Totals' })} ({rows.length})
              </td>
              <td className="px-4 py-3 text-end tabular-nums"><CurrencyText amount={tp} /></td>
              <td className="px-4 py-3 text-end tabular-nums"><CurrencyText amount={tc} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (data.length === 0) return <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>

  if (tab === 'sales') {
    type SaleRow = { sale_number: string; invoice_number: string | null; customer_name: string | null; total_amount: number; amount_paid: number; balance_due: number; status: string; created_at: string }
    const rows = data as SaleRow[]
    const total = rows.reduce((s, r) => s + r.total_amount, 0)
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">Invoice</th>
              <th className="text-start px-4 py-3 font-medium">{t('customers.title')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('common.total')}</th>
              <th className="text-end px-4 py-3 font-medium">Paid</th>
              <th className="text-end px-4 py-3 font-medium">Due</th>
              <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{r.invoice_number ?? r.sale_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.customer_name ?? '—'}</td>
                <td className="px-4 py-3 text-end font-medium"><CurrencyText amount={r.total_amount} /></td>
                <td className="px-4 py-3 text-end text-green-600"><CurrencyText amount={r.amount_paid} /></td>
                <td className="px-4 py-3 text-end">{r.balance_due > 0 ? <CurrencyText amount={r.balance_due} className="text-destructive" /> : '—'}</td>
                <td className="px-4 py-3 text-center text-xs">{r.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm">Total ({rows.length} sales)</td>
              <td className="px-4 py-3 text-end"><CurrencyText amount={total} /></td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (tab === 'profit') {
    type ProfitRow = { day: string; revenue: number; cogs: number; gross_profit: number }
    const rows = data as ProfitRow[]
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.date')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('reports.revenue')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('reports.cogs')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('reports.grossProfit')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('reports.margin')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{formatDate(r.day)}</td>
                <td className="px-4 py-3 text-end"><CurrencyText amount={r.revenue} /></td>
                <td className="px-4 py-3 text-end text-muted-foreground"><CurrencyText amount={r.cogs} /></td>
                <td className="px-4 py-3 text-end text-green-600 font-medium"><CurrencyText amount={r.gross_profit} /></td>
                <td className="px-4 py-3 text-end text-muted-foreground">{r.revenue > 0 ? `${((r.gross_profit / r.revenue) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'inventory') {
    type InvRow = { name: string; sku: string | null; stock_quantity: number; unit: string; cost_price: number; sell_price: number; stock_value: number; category: string; brand: string }
    const rows = data as InvRow[]
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
              <th className="text-start px-4 py-3 font-medium">SKU</th>
              <th className="text-end px-4 py-3 font-medium">Stock</th>
              <th className="text-end px-4 py-3 font-medium">Cost</th>
              <th className="text-end px-4 py-3 font-medium">Price</th>
              <th className="text-end px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.sku ?? '—'}</td>
                <td className="px-4 py-3 text-end">{r.stock_quantity} {r.unit}</td>
                <td className="px-4 py-3 text-end text-muted-foreground"><CurrencyText amount={r.cost_price} /></td>
                <td className="px-4 py-3 text-end"><CurrencyText amount={r.sell_price} /></td>
                <td className="px-4 py-3 text-end font-medium"><CurrencyText amount={r.stock_value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'lowstock') {
    type LowRow = { name: string; sku: string | null; stock_quantity: number; low_stock_threshold: number; unit: string; category: string; supplier: string }
    const rows = data as LowRow[]
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
              <th className="text-end px-4 py-3 font-medium">Stock</th>
              <th className="text-end px-4 py-3 font-medium">Threshold</th>
              <th className="text-start px-4 py-3 font-medium">Category</th>
              <th className="text-start px-4 py-3 font-medium">Supplier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3 text-end font-bold text-destructive">{r.stock_quantity} {r.unit}</td>
                <td className="px-4 py-3 text-end text-muted-foreground">{r.low_stock_threshold}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.supplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'topproducts') {
    type TopRow = { product_name: string; product_sku: string | null; total_qty: number; total_revenue: number; total_cost: number; profit: number }
    const rows = data as TopRow[]
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
              <th className="text-end px-4 py-3 font-medium">Qty Sold</th>
              <th className="text-end px-4 py-3 font-medium">Revenue</th>
              <th className="text-end px-4 py-3 font-medium">COGS</th>
              <th className="text-end px-4 py-3 font-medium">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3">{r.product_name}</td>
                <td className="px-4 py-3 text-end font-bold">{r.total_qty}</td>
                <td className="px-4 py-3 text-end"><CurrencyText amount={r.total_revenue} /></td>
                <td className="px-4 py-3 text-end text-muted-foreground"><CurrencyText amount={r.total_cost} /></td>
                <td className="px-4 py-3 text-end text-green-600 font-medium"><CurrencyText amount={r.profit} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'debts') {
    type DebtRow = { id: number; name: string; phone: string | null; balance: number; sale_count: number; total_due: number }
    const rows = data as DebtRow[]
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('customers.title')}</th>
              <th className="text-start px-4 py-3 font-medium">{t('customers.phone')}</th>
              <th className="text-end px-4 py-3 font-medium">Sales</th>
              <th className="text-end px-4 py-3 font-medium">Owes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.phone ?? '—'}</td>
                <td className="px-4 py-3 text-end">{r.sale_count}</td>
                <td className="px-4 py-3 text-end font-bold text-destructive">
                  <CurrencyText amount={reportDept !== 'all' ? r.total_due : Math.abs(r.balance)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tab === 'expenses_category') {
    type CatRow = { category_name: string | null; color: string; total: number }
    const rows = data as CatRow[]
    const grandTotal = rows.reduce((s, r) => s + r.total, 0)
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('expenses.category')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('common.amount')}</th>
              <th className="text-end px-4 py-3 font-medium">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color ?? '#6b7280' }} />
                    {r.category_name ?? t('expenses.noCategory')}
                  </div>
                </td>
                <td className="px-4 py-3 text-end font-medium text-destructive"><CurrencyText amount={r.total} className="text-destructive" /></td>
                <td className="px-4 py-3 text-end text-muted-foreground">{grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td className="px-4 py-3 text-sm">{t('common.total')}</td>
              <td className="px-4 py-3 text-end text-destructive"><CurrencyText amount={grandTotal} className="text-destructive" /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (tab === 'expenses_monthly') {
    type MonthRow = { month: string; total: number }
    const rows = data as MonthRow[]
    const grandTotal = rows.reduce((s, r) => s + r.total, 0)
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{t('common.date')}</th>
              <th className="text-end px-4 py-3 font-medium">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{r.month}</td>
                <td className="px-4 py-3 text-end font-medium text-destructive"><CurrencyText amount={r.total} className="text-destructive" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td className="px-4 py-3 text-sm">{t('common.total')}</td>
              <td className="px-4 py-3 text-end text-destructive"><CurrencyText amount={grandTotal} className="text-destructive" /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  return <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
}
