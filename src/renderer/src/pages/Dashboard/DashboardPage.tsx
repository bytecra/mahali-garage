import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, Wrench, Package, TrendingUp, AlertCircle, DollarSign, CheckSquare, Clock, Truck, TriangleAlert } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { formatCurrency } from '../../lib/utils'
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
  salesTrend: Array<{ day: string; revenue: number; count: number }>
  topProducts: Array<{ product_name: string; total_qty: number; total_revenue: number }>
  urgentRepairs: Array<{ job_number: string; priority: string; status: string; customer_name: string | null; device_brand: string | null; device_model: string | null }>
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string }): JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex items-start gap-4">
      <div className={`flex items-center justify-center w-11 h-11 rounded-lg ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage(): JSX.Element {
  const { t } = useTranslation()
  const { role } = useAuthStore()
  const canTasks = usePermission('tasks.view')
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

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard icon={ShoppingCart} label={t('dashboard.todaySales')}
          value={formatCurrency(data?.todayRevenue ?? 0)}
          sub={`${data?.todaySalesCount ?? 0} transactions`}
          color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" />
        <StatCard icon={TrendingUp} label={t('dashboard.monthRevenue')}
          value={formatCurrency(data?.monthRevenue ?? 0)}
          color="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400" />
        <StatCard icon={Wrench} label={t('dashboard.activeRepairs')}
          value={data?.activeRepairs ?? 0}
          color="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400" />
        <StatCard icon={Package} label={t('dashboard.lowStock')}
          value={data?.lowStock ?? 0}
          color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
      </div>

      {/* Stats Row 2 — Financials */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={TrendingUp} label={t('dashboard.grossProfit')}
          value={formatCurrency(data?.monthGrossProfit ?? 0)}
          sub={t('dashboard.thisMonth')}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" />
        <StatCard icon={DollarSign} label={t('dashboard.monthExpenses')}
          value={formatCurrency(data?.monthExpenses ?? 0)}
          sub={t('dashboard.thisMonth')}
          color="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" />
        <StatCard icon={DollarSign} label={t('dashboard.netProfit')}
          value={formatCurrency(data?.monthNetProfit ?? 0)}
          sub={t('dashboard.thisMonth')}
          color={(data?.monthNetProfit ?? 0) >= 0 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'} />
      </div>

      {/* Stats Row 3 — Tasks (role-aware) */}
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
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
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

      {/* Urgent repairs */}
      {(data?.urgentRepairs?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <h2 className="font-semibold text-foreground">{t('dashboard.urgentJobs')}</h2>
          </div>
          <div className="space-y-2">
            {data?.urgentRepairs?.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{r.job_number}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-sm text-foreground">{r.customer_name ?? 'Walk-in'}</span>
                  {(r.device_brand || r.device_model) && (
                    <span className="text-sm text-muted-foreground ml-2">— {[r.device_brand, r.device_model].filter(Boolean).join(' ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
