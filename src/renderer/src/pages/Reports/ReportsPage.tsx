import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { formatCurrency, formatDate } from '../../lib/utils'
import { FeatureGate } from '../../components/FeatureGate'

type ReportTab = 'sales' | 'profit' | 'inventory' | 'lowstock' | 'topproducts' | 'debts' | 'expenses_category' | 'expenses_monthly'
type ReportDept = 'all' | 'mechanical' | 'programming'

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
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setData([])
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
      if (res?.success) setData(res.data as unknown[])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tab, dateFrom, dateTo, reportDept])

  const TABS: Array<{ key: ReportTab; label: string }> = [
    { key: 'sales',       label: t('reports.salesDaily') },
    { key: 'profit',      label: t('reports.profit') },
    { key: 'inventory',   label: t('reports.inventory') },
    { key: 'lowstock',    label: t('reports.lowStock') },
    { key: 'topproducts', label: t('reports.topProducts') },
    { key: 'debts',              label: t('reports.customerDebts') },
    { key: 'expenses_category',  label: t('reports.expensesCategory') },
    { key: 'expenses_monthly',   label: t('reports.expensesMonthly') },
  ]

  const showDateRange = ['sales', 'profit', 'topproducts', 'expenses_category', 'expenses_monthly'].includes(tab)
  const showDeptFilter = ['sales', 'profit', 'debts', 'expenses_category', 'expenses_monthly'].includes(tab)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
        <button onClick={() => exportCsv(data as Record<string, unknown>[], `${tab}-report.csv`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
          <Download className="w-4 h-4" />{t('reports.exportCsv')}
        </button>
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

          {/* Table */}
          <ReportTable tab={tab} data={data} reportDept={reportDept} />
        </>
      )}
    </div>
  )
}

function ReportTable({ tab, data, reportDept }: { tab: ReportTab; data: unknown[]; reportDept: ReportDept }): JSX.Element {
  const { t } = useTranslation()
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
                <td className="px-4 py-3 text-end font-medium">{formatCurrency(r.total_amount)}</td>
                <td className="px-4 py-3 text-end text-green-600">{formatCurrency(r.amount_paid)}</td>
                <td className="px-4 py-3 text-end">{r.balance_due > 0 ? <span className="text-destructive">{formatCurrency(r.balance_due)}</span> : '—'}</td>
                <td className="px-4 py-3 text-center text-xs">{r.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm">Total ({rows.length} sales)</td>
              <td className="px-4 py-3 text-end">{formatCurrency(total)}</td>
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
                <td className="px-4 py-3 text-end">{formatCurrency(r.revenue)}</td>
                <td className="px-4 py-3 text-end text-muted-foreground">{formatCurrency(r.cogs)}</td>
                <td className="px-4 py-3 text-end text-green-600 font-medium">{formatCurrency(r.gross_profit)}</td>
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
                <td className="px-4 py-3 text-end text-muted-foreground">{formatCurrency(r.cost_price)}</td>
                <td className="px-4 py-3 text-end">{formatCurrency(r.sell_price)}</td>
                <td className="px-4 py-3 text-end font-medium">{formatCurrency(r.stock_value)}</td>
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
                <td className="px-4 py-3 text-end">{formatCurrency(r.total_revenue)}</td>
                <td className="px-4 py-3 text-end text-muted-foreground">{formatCurrency(r.total_cost)}</td>
                <td className="px-4 py-3 text-end text-green-600 font-medium">{formatCurrency(r.profit)}</td>
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
                  {formatCurrency(reportDept !== 'all' ? r.total_due : Math.abs(r.balance))}
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
                <td className="px-4 py-3 text-end font-medium text-destructive">{formatCurrency(r.total)}</td>
                <td className="px-4 py-3 text-end text-muted-foreground">{grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td className="px-4 py-3 text-sm">{t('common.total')}</td>
              <td className="px-4 py-3 text-end text-destructive">{formatCurrency(grandTotal)}</td>
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
                <td className="px-4 py-3 text-end font-medium text-destructive">{formatCurrency(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-bold">
            <tr>
              <td className="px-4 py-3 text-sm">{t('common.total')}</td>
              <td className="px-4 py-3 text-end text-destructive">{formatCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  return <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
}
