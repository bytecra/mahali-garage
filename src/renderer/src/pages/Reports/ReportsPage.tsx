import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import { formatCurrency, formatDate } from '../../lib/utils'
import CurrencyText from '../../components/shared/CurrencyText'
import { FeatureGate } from '../../components/FeatureGate'
import { toast } from '../../store/notificationStore'
import {
  buildAttendancePdf,
  buildDailySalesPdf,
  buildDepartmentReportsPdf,
  buildEmployeePerformancePdf,
  buildEmployeePayslipPdf,
  buildGenericTablePdf,
  buildProfitPdf,
  buildDailySalesComparisonPdf,
  buildProfitComparisonPdf,
  buildTopProductsComparisonPdf,
  buildSalarySummaryPdf,
  buildTopServicesPdf,
} from '../../utils/reportPdfTemplate'
import {
  resolveComparisonPeriods,
  resolveSingleExportRange,
  type ComparisonMode,
  type MonthComparisonPreset,
  type DateRange,
} from '../../utils/reportComparisonRanges'
import {
  buildAlignedSalesChart,
  buildAlignedProfitChart,
  mergeTopProducts,
  pctChange,
  type MergedTopProduct,
  type SaleRow,
  type ProfitRow,
  type TopProductRow,
} from '../../utils/reportComparisonData'
import {
  buildDailySalesComparisonExcelBuffer,
  buildDailySalesExcelBuffer,
  buildProfitComparisonExcelBuffer,
  buildProfitExcelBuffer,
  buildTopProductsComparisonExcelBuffer,
  buildTopProductsExcelBuffer,
  downloadXlsxBuffer,
  excelFilename,
} from '../../utils/reportExcelExport'

type ReportTab = 'sales' | 'profit' | 'department_reports' | 'inventory' | 'lowstock' | 'topproducts' | 'debts' | 'expenses_category' | 'expenses_monthly' | 'assets' | 'attendance' | 'salary' | 'performance'
type ReportDept = 'all' | 'mechanical' | 'programming'
type DepartmentPreset = 'today' | 'week' | 'month' | 'custom'

const QUICK_PDF_TABS: ReportTab[] = [
  'inventory',
  'lowstock',
  'topproducts',
  'debts',
  'expenses_category',
  'expenses_monthly',
  'assets',
  'department_reports',
  'sales',
  'profit',
]

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
  const [exportModalFormat, setExportModalFormat] = useState<'pdf' | 'excel'>('pdf')
  const [exportingModal, setExportingModal] = useState(false)
  const [exportingQuickPdf, setExportingQuickPdf] = useState(false)
  const [exportPeriod, setExportPeriod] = useState<'weekly' | 'monthly' | 'custom'>('monthly')
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exportWeekDate, setExportWeekDate] = useState('')
  const [exportDepartment, setExportDepartment] = useState<'mechanical' | 'programming' | 'both'>('both')

  const [periodCompareMode, setPeriodCompareMode] = useState<ComparisonMode>('single')
  const [monthComparePreset, setMonthComparePreset] = useState<MonthComparisonPreset>('this_vs_last_month')
  const [customP1From, setCustomP1From] = useState('')
  const [customP1To, setCustomP1To] = useState('')
  const [customP2From, setCustomP2From] = useState('')
  const [customP2To, setCustomP2To] = useState('')
  type CompareBundle = {
    p1: DateRange
    p2: DateRange
    sales: [SaleRow[], SaleRow[]] | null
    profit: [ProfitRow[], ProfitRow[]] | null
    top: [TopProductRow[], TopProductRow[]] | null
  }
  const [compareData, setCompareData] = useState<CompareBundle | null>(null)

  const [attendanceEmployees, setAttendanceEmployees] = useState<
    Array<{
      id: number
      employee_id: string
      full_name: string
      department: string
    }>
  >([])

  const [selectedAttendanceEmp, setSelectedAttendanceEmp] = useState<number | null>(null)

  const [attendanceFromDate, setAttendanceFromDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })

  const [attendanceToDate, setAttendanceToDate] = useState(() => new Date().toISOString().split('T')[0])

  const [generatingAttendancePdf, setGeneratingAttendancePdf] = useState(false)

  const [salaryReportType, setSalaryReportType] = useState<'single' | 'all'>('all')
  const [salaryEmployee, setSalaryEmployee] = useState<number | null>(null)
  const [salaryFromDate, setSalaryFromDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [salaryToDate, setSalaryToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [salaryDept, setSalaryDept] = useState('all')
  const [salaryEmployees, setSalaryEmployees] = useState<
    Array<{
      id: number
      employee_id: string
      full_name: string
      department: string
    }>
  >([])
  const [generatingSalaryPdf, setGeneratingSalaryPdf] = useState(false)

  const [perfEmployeeId, setPerfEmployeeId] = useState<number | null>(null)
  const [perfFromDate, setPerfFromDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [perfToDate, setPerfToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [perfDept, setPerfDept] = useState('all')
  const [perfEmployees, setPerfEmployees] = useState<
    Array<{
      id: number
      employee_id: string
      full_name: string
      department: string
    }>
  >([])
  const [generatingPerfPdf, setGeneratingPerfPdf] = useState(false)
  const [perfPreview, setPerfPreview] = useState<
    Array<{
      employee_code: string
      full_name: string
      department: string
      total_jobs: number
      total_hours: number
      total_revenue: number
    }>
  >([])
  const [loadingPerf, setLoadingPerf] = useState(false)

  async function handleAttendancePdf(): Promise<void> {
    if (!selectedAttendanceEmp) {
      toast.error('Please select an employee')
      return
    }
    setGeneratingAttendancePdf(true)
    try {
      const employee = attendanceEmployees.find((e) => e.id === selectedAttendanceEmp)
      if (!employee) return

      const [recordsRes, storeNameRes] = await Promise.all([
        window.electronAPI.attendance.getReport(selectedAttendanceEmp, attendanceFromDate, attendanceToDate),
        window.electronAPI.settings.get('store.name'),
      ])

      if (!recordsRes?.success) {
        toast.error(recordsRes?.error ?? 'Failed to load attendance')
        return
      }

      const records = recordsRes.data ?? []
      const storeName = (storeNameRes?.success ? storeNameRes.data : null) || 'Mahali Garage'

      const statusCounts: Record<string, { status_name: string; status_emoji: string; count: number }> = {}
      for (const r of records) {
        const k = r.status_name
        if (!statusCounts[k]) {
          statusCounts[k] = { status_name: r.status_name, status_emoji: r.status_emoji, count: 0 }
        }
        statusCounts[k].count++
      }

      const presentCount = statusCounts['Present']?.count ?? 0
      const totalDays = records.length
      const attendanceRate = totalDays > 0 ? presentCount / totalDays : 0

      const summary = {
        total_days: totalDays,
        present_days: presentCount,
        attendance_rate: attendanceRate,
        by_status: Object.values(statusCounts),
      }

      const html = buildAttendancePdf({
        employeeId: employee.id,
        employeeName: employee.full_name,
        employeeIdNumber: employee.employee_id,
        department: employee.department ?? '',
        fromDate: attendanceFromDate,
        toDate: attendanceToDate,
        storeName: String(storeName),
        records,
        summary,
      })

      const printRes = await window.electronAPI.print.receipt(html)
      if (!printRes?.success) throw new Error('Print failed')
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setGeneratingAttendancePdf(false)
    }
  }

  async function handleSalaryPdf(): Promise<void> {
    setGeneratingSalaryPdf(true)
    try {
      const [reportRes, storeRes, currencyRes] = await Promise.all([
        window.electronAPI.reports.salaryReport({
          type: salaryReportType,
          employeeId: salaryEmployee ?? undefined,
          fromDate: salaryFromDate,
          toDate: salaryToDate,
          department: salaryDept,
        }),
        window.electronAPI.settings.get('store.name'),
        window.electronAPI.settings.get('store.currency_symbol'),
      ])

      if (!reportRes?.success) {
        toast.error(reportRes?.error ?? 'Failed to load report')
        return
      }

      const storeName = (storeRes?.success ? storeRes.data : null) || 'Mahali Garage'
      const currencySym = (currencyRes?.success ? currencyRes.data : null) || 'د.إ'
      const data = reportRes.data

      if (data == null) {
        toast.error('No data found')
        return
      }

      let html = ''

      if (salaryReportType === 'single') {
        const single = data as {
          employee: {
            employee_id: string
            full_name: string
            department: string
            role: string
            phone: string | null
          }
          payments: Array<{
            period_start: string
            period_end: string
            paid_date: string | null
            status: string
            amount: number
            overtime_hours: number
            overtime_rate: number
            overtime_amount: number
            bonus_amount: number
            bonus_type: string | null
            bonus_note: string | null
            absence_deduction: number
            absence_days: number
            notes: string | null
          }>
        }
        const { employee, payments } = single
        if (!payments?.length) {
          toast.error('No salary records found')
          return
        }
        html = buildEmployeePayslipPdf({
          employee,
          payment: payments[0]!,
          storeName: String(storeName),
          currencySymbol: String(currencySym),
        })
      } else {
        html = buildSalarySummaryPdf({
          employees: data as Array<{
            employee_id: string
            full_name: string
            department: string
            base_salary: number
            overtime_total: number
            bonus_total: number
            deduction_total: number
            net_total: number
            payments_count: number
          }>,
          fromDate: salaryFromDate,
          toDate: salaryToDate,
          department: salaryDept,
          storeName: String(storeName),
          currencySymbol: String(currencySym),
        })
      }

      const printRes = await window.electronAPI.print.receipt(html)
      if (!printRes?.success) throw new Error('Print failed')
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setGeneratingSalaryPdf(false)
    }
  }

  const loadPerfPreview = useCallback(async () => {
    setLoadingPerf(true)
    try {
      const res = await window.electronAPI.reports.employeePerformance({
        employeeId: perfEmployeeId ?? undefined,
        fromDate: perfFromDate,
        toDate: perfToDate,
        department: perfDept,
      })
      if (res?.success) {
        const raw = (res.data as Array<{
          employee_id: number
          employee_code: string
          full_name: string
          department: string
          total_jobs: number
          total_hours: number
          total_revenue: number
        }>) ?? []
        setPerfPreview(
          raw.map((r) => ({
            employee_code: r.employee_code,
            full_name: r.full_name,
            department: r.department,
            total_jobs: r.total_jobs,
            total_hours: r.total_hours,
            total_revenue: r.total_revenue,
          })),
        )
      }
    } finally {
      setLoadingPerf(false)
    }
  }, [perfEmployeeId, perfFromDate, perfToDate, perfDept])

  async function handlePerfPdf(): Promise<void> {
    if (!perfPreview.length) {
      toast.error('No data to export')
      return
    }
    setGeneratingPerfPdf(true)
    try {
      const [fullRes, storeRes, currencyRes] = await Promise.all([
        window.electronAPI.reports.employeePerformance({
          employeeId: perfEmployeeId ?? undefined,
          fromDate: perfFromDate,
          toDate: perfToDate,
          department: perfDept,
        }),
        window.electronAPI.settings.get('store.name'),
        window.electronAPI.settings.get('store.currency_symbol'),
      ])

      if (!fullRes?.success) {
        toast.error(fullRes?.error ?? 'Failed to load report')
        return
      }

      const employeesFull = (fullRes.data as Array<{
        employee_id: number
        employee_code: string
        full_name: string
        department: string
        total_jobs: number
        total_hours: number
        total_revenue: number
        avg_hours_per_job: number
        avg_revenue_per_job: number
        mechanical_jobs: number
        programming_jobs: number
        both_jobs: number
      }>) ?? []

      const html = buildEmployeePerformancePdf({
        employees: employeesFull,
        fromDate: perfFromDate,
        toDate: perfToDate,
        department: perfDept,
        storeName: (storeRes?.success ? storeRes.data : null) || 'Mahali Garage',
        currencySymbol: (currencyRes?.success ? currencyRes.data : null) || 'AED',
      })

      const printRes = await window.electronAPI.print.receipt(html)
      if (!printRes?.success) throw new Error('Print failed')
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setGeneratingPerfPdf(false)
    }
  }

  async function handleExportPdf(): Promise<void> {
    const storeRes = await window.electronAPI.settings.get('store_name')
    const storeName = (storeRes?.success ? storeRes.data : null) ?? 'Mahali Garage'
    const currencyRes = await window.electronAPI.settings.get('currency')
    const currency = (currencyRes?.success ? currencyRes.data : null) ?? 'AED'

    const department = exportDepartment
    const depts: Array<'Mechanical' | 'Programming'> = department === 'both'
      ? ['Mechanical', 'Programming']
      : department === 'mechanical'
        ? ['Mechanical']
        : ['Programming']

    const mapSaleRow = (row: {
      sale_number: string
      customer_name: string | null
      total_amount: number
      status: string
    }) => ({
      invoice: row.sale_number,
      customer: row.customer_name ?? 'Walk-in',
      car: '—',
      amount: row.total_amount,
      status: row.status,
    })

    setExportingModal(true)
    try {
      if (periodCompareMode !== 'single') {
        const cmp = resolveComparisonPeriods(periodCompareMode, monthComparePreset, {
          p1From: customP1From,
          p1To: customP1To,
          p2From: customP2From,
          p2To: customP2To,
        })
        if (!cmp) {
          toast.error(t('reports.invalidComparisonRange', { defaultValue: 'Invalid comparison date range' }))
          return
        }
        const f1 = `${cmp.period1.from} 00:00:00`
        const t1 = `${cmp.period1.to} 23:59:59`
        const f2 = `${cmp.period2.from} 00:00:00`
        const t2 = `${cmp.period2.to} 23:59:59`

        for (let i = 0; i < depts.length; i++) {
          const dept = depts[i]
          const deptParam = dept.toLowerCase() as 'mechanical' | 'programming'
          let html = ''

          if (tab === 'sales') {
            const [salesRes1, salesRes2] = await Promise.all([
              window.electronAPI.reports.salesDaily(f1, t1, deptParam),
              window.electronAPI.reports.salesDaily(f2, t2, deptParam),
            ])
            if (!salesRes1?.success || !salesRes2?.success) {
              throw new Error(salesRes1?.error || salesRes2?.error || 'Failed to load daily sales data')
            }
            const rows1 = (salesRes1.data as SaleRow[]) ?? []
            const rows2 = (salesRes2.data as SaleRow[]) ?? []
            const aligned = buildAlignedSalesChart(rows1, rows2)
            const dailyAligned = aligned.map((p) => ({
              day1: p.day1 ?? '—',
              rev1: p.revenue1,
              day2: p.day2 ?? '—',
              rev2: p.revenue2,
            }))
            html = buildDailySalesComparisonPdf({
              storeName,
              currency,
              department: dept,
              period1Label: cmp.period1.label,
              period2Label: cmp.period2.label,
              period1From: cmp.period1.from,
              period1To: cmp.period1.to,
              period2From: cmp.period2.from,
              period2To: cmp.period2.to,
              rows1: rows1.map(mapSaleRow),
              rows2: rows2.map(mapSaleRow),
              dailyAligned,
            })
          } else if (tab === 'profit') {
            const [profitRes1, profitRes2] = await Promise.all([
              window.electronAPI.reports.profit(f1, t1, deptParam),
              window.electronAPI.reports.profit(f2, t2, deptParam),
            ])
            if (!profitRes1?.success || !profitRes2?.success) {
              throw new Error(profitRes1?.error || profitRes2?.error || 'Failed to load profit data')
            }
            const pr1 = (profitRes1.data as ProfitRow[]) ?? []
            const pr2 = (profitRes2.data as ProfitRow[]) ?? []
            const total1 = {
              revenue: pr1.reduce((s, row) => s + row.revenue, 0),
              cost: pr1.reduce((s, row) => s + row.cogs, 0),
              grossProfit: pr1.reduce((s, row) => s + row.gross_profit, 0),
            }
            const total2 = {
              revenue: pr2.reduce((s, row) => s + row.revenue, 0),
              cost: pr2.reduce((s, row) => s + row.cogs, 0),
              grossProfit: pr2.reduce((s, row) => s + row.gross_profit, 0),
            }
            html = buildProfitComparisonPdf({
              storeName,
              currency,
              department: dept,
              period1Label: cmp.period1.label,
              period2Label: cmp.period2.label,
              period1From: cmp.period1.from,
              period1To: cmp.period1.to,
              period2From: cmp.period2.from,
              period2To: cmp.period2.to,
              total1,
              total2,
            })
          } else if (tab === 'topproducts') {
            const [topRes1, topRes2] = await Promise.all([
              window.electronAPI.reports.topProducts(f1, t1),
              window.electronAPI.reports.topProducts(f2, t2),
            ])
            if (!topRes1?.success || !topRes2?.success) {
              throw new Error(topRes1?.error || topRes2?.error || 'Failed to load top products data')
            }
            const tr1 = (topRes1.data as TopProductRow[]) ?? []
            const tr2 = (topRes2.data as TopProductRow[]) ?? []
            const merged = mergeTopProducts(tr1, tr2)
            html = buildTopProductsComparisonPdf({
              storeName,
              currency,
              department: dept,
              period1Label: cmp.period1.label,
              period2Label: cmp.period2.label,
              period1From: cmp.period1.from,
              period1To: cmp.period1.to,
              period2From: cmp.period2.from,
              period2To: cmp.period2.to,
              rows: merged.map((m) => ({
                product_name: m.product_name,
                qty1: m.qty1,
                rev1: m.rev1,
                qty2: m.qty2,
                rev2: m.rev2,
                deltaRev: m.deltaRev,
                deltaPct: m.deltaPct,
              })),
            })
          } else {
            throw new Error('PDF export is only supported for Sales, Profit, and Top Products tabs')
          }

          const printRes = await window.electronAPI.print.receipt(html)
          if (!printRes?.success) throw new Error('Print failed')
          if (depts.length > 1 && i < depts.length - 1) await new Promise((r) => setTimeout(r, 600))
        }
        return
      }

      const single = resolveSingleExportRange(exportPeriod, exportDateFrom, exportDateTo, exportWeekDate)
      let resolvedFrom = single.from
      let resolvedTo = single.to
      if (exportPeriod === 'custom' && (!exportDateFrom || !exportDateTo)) {
        toast.error('Please select both From and To dates')
        return
      }

      const resolvedFromFull = resolvedFrom + ' 00:00:00'
      const resolvedToFull = resolvedTo + ' 23:59:59'

      const topProductsRes = tab === 'topproducts'
        ? await window.electronAPI.reports.topProducts(resolvedFromFull, resolvedToFull)
        : null

      for (let i = 0; i < depts.length; i++) {
        const dept = depts[i]
        const deptParam = dept.toLowerCase() as 'mechanical' | 'programming'
        let html = ''

        if (tab === 'sales') {
          const salesRes = await window.electronAPI.reports.salesDaily(resolvedFromFull, resolvedToFull, deptParam)
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
          const profitRes = await window.electronAPI.reports.profit(resolvedFromFull, resolvedToFull, deptParam)
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
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Failed to export PDF'
      toast.error(msg)
    } finally {
      setExportingModal(false)
    }
  }

  async function handleExportExcel(): Promise<void> {
    const storeRes = await window.electronAPI.settings.get('store_name')
    const storeName = (storeRes?.success ? storeRes.data : null) ?? 'Mahali Garage'
    const currencyRes = await window.electronAPI.settings.get('currency')
    const currencySymbol = (currencyRes?.success ? currencyRes.data : null) ?? 'AED'

    const department = exportDepartment
    const depts: Array<'Mechanical' | 'Programming'> =
      department === 'both'
        ? ['Mechanical', 'Programming']
        : department === 'mechanical'
          ? ['Mechanical']
          : ['Programming']

    setExportingModal(true)
    try {
      if (periodCompareMode !== 'single') {
        const cmp = resolveComparisonPeriods(periodCompareMode, monthComparePreset, {
          p1From: customP1From,
          p1To: customP1To,
          p2From: customP2From,
          p2To: customP2To,
        })
        if (!cmp) {
          toast.error(t('reports.invalidComparisonRange', { defaultValue: 'Invalid comparison date range' }))
          return
        }
        const f1 = `${cmp.period1.from} 00:00:00`
        const t1 = `${cmp.period1.to} 23:59:59`
        const f2 = `${cmp.period2.from} 00:00:00`
        const t2 = `${cmp.period2.to} 23:59:59`

        for (let i = 0; i < depts.length; i++) {
          const dept = depts[i]
          const deptParam = dept.toLowerCase() as 'mechanical' | 'programming'

          if (tab === 'sales') {
            const [salesRes1, salesRes2] = await Promise.all([
              window.electronAPI.reports.salesDaily(f1, t1, deptParam),
              window.electronAPI.reports.salesDaily(f2, t2, deptParam),
            ])
            if (!salesRes1?.success || !salesRes2?.success) {
              throw new Error(salesRes1?.error || salesRes2?.error || 'Failed to load daily sales data')
            }
            const rows1 = (salesRes1.data as SaleRow[]) ?? []
            const rows2 = (salesRes2.data as SaleRow[]) ?? []
            const buf = await buildDailySalesComparisonExcelBuffer({
              storeName,
              currencySymbol,
              department: dept,
              p1: cmp.period1,
              p2: cmp.period2,
              rows1,
              rows2,
            })
            const name = excelFilename({
              report: 'Daily-Sales',
              dateFrom: cmp.period1.from,
              dateTo: cmp.period2.to,
              dept,
              compare: true,
            })
            downloadXlsxBuffer(buf, name)
          } else if (tab === 'profit') {
            const [profitRes1, profitRes2] = await Promise.all([
              window.electronAPI.reports.profit(f1, t1, deptParam),
              window.electronAPI.reports.profit(f2, t2, deptParam),
            ])
            if (!profitRes1?.success || !profitRes2?.success) {
              throw new Error(profitRes1?.error || profitRes2?.error || 'Failed to load profit data')
            }
            const pr1 = (profitRes1.data as ProfitRow[]) ?? []
            const pr2 = (profitRes2.data as ProfitRow[]) ?? []
            const buf = await buildProfitComparisonExcelBuffer({
              storeName,
              currencySymbol,
              department: dept,
              p1: cmp.period1,
              p2: cmp.period2,
              profit1: pr1,
              profit2: pr2,
            })
            const name = excelFilename({
              report: 'Profit',
              dateFrom: cmp.period1.from,
              dateTo: cmp.period2.to,
              dept,
              compare: true,
            })
            downloadXlsxBuffer(buf, name)
          } else if (tab === 'topproducts') {
            const [topRes1, topRes2] = await Promise.all([
              window.electronAPI.reports.topProducts(f1, t1),
              window.electronAPI.reports.topProducts(f2, t2),
            ])
            if (!topRes1?.success || !topRes2?.success) {
              throw new Error(topRes1?.error || topRes2?.error || 'Failed to load top products data')
            }
            const tr1 = (topRes1.data as TopProductRow[]) ?? []
            const tr2 = (topRes2.data as TopProductRow[]) ?? []
            const buf = await buildTopProductsComparisonExcelBuffer({
              storeName,
              currencySymbol,
              department: dept,
              p1: cmp.period1,
              p2: cmp.period2,
              rows1: tr1,
              rows2: tr2,
            })
            const name = excelFilename({
              report: 'Top-Products',
              dateFrom: cmp.period1.from,
              dateTo: cmp.period2.to,
              dept,
              compare: true,
            })
            downloadXlsxBuffer(buf, name)
          } else {
            throw new Error('Excel export is only supported for Sales, Profit, and Top Products tabs')
          }

          if (depts.length > 1 && i < depts.length - 1) await new Promise((r) => setTimeout(r, 400))
        }
        return
      }

      const single = resolveSingleExportRange(exportPeriod, exportDateFrom, exportDateTo, exportWeekDate)
      const resolvedFrom = single.from
      const resolvedTo = single.to
      if (exportPeriod === 'custom' && (!exportDateFrom || !exportDateTo)) {
        toast.error('Please select both From and To dates')
        return
      }

      const resolvedFromFull = `${resolvedFrom} 00:00:00`
      const resolvedToFull = `${resolvedTo} 23:59:59`

      const topProductsRes =
        tab === 'topproducts' ? await window.electronAPI.reports.topProducts(resolvedFromFull, resolvedToFull) : null

      for (let i = 0; i < depts.length; i++) {
        const dept = depts[i]
        const deptParam = dept.toLowerCase() as 'mechanical' | 'programming'

        if (tab === 'sales') {
          const salesRes = await window.electronAPI.reports.salesDaily(resolvedFromFull, resolvedToFull, deptParam)
          if (!salesRes?.success) throw new Error(salesRes?.error || 'Failed to load daily sales data')
          const salesRows =
            (salesRes.data as Array<{
              sale_number: string
              customer_name: string | null
              total_amount: number
              status: string
              created_at: string
            }>) ?? []
          const buf = await buildDailySalesExcelBuffer({
            storeName,
            currencySymbol,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            salesRows,
          })
          const name = excelFilename({
            report: 'Daily-Sales',
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            dept,
          })
          downloadXlsxBuffer(buf, name)
        } else if (tab === 'profit') {
          const profitRes = await window.electronAPI.reports.profit(resolvedFromFull, resolvedToFull, deptParam)
          if (!profitRes?.success) throw new Error(profitRes?.error || 'Failed to load profit data')
          const profitRows = (profitRes.data as ProfitRow[]) ?? []
          const buf = await buildProfitExcelBuffer({
            storeName,
            currencySymbol,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            profitRows,
          })
          const name = excelFilename({
            report: 'Profit',
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            dept,
          })
          downloadXlsxBuffer(buf, name)
        } else if (tab === 'topproducts') {
          if (!topProductsRes?.success) throw new Error(topProductsRes?.error || 'Failed to load top products data')
          const topRows = (topProductsRes.data as TopProductRow[]) ?? []
          const buf = await buildTopProductsExcelBuffer({
            storeName,
            currencySymbol,
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            department: dept,
            rows: topRows,
          })
          const name = excelFilename({
            report: 'Top-Products',
            dateFrom: resolvedFrom,
            dateTo: resolvedTo,
            dept,
          })
          downloadXlsxBuffer(buf, name)
        } else {
          throw new Error('Excel export is only supported for Sales, Profit, and Top Products tabs')
        }

        if (depts.length > 1 && i < depts.length - 1) {
          await new Promise((r) => setTimeout(r, 400))
        }
      }
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Failed to export Excel'
      toast.error(msg)
    } finally {
      setExportingModal(false)
    }
  }

  async function handleQuickReportPdf(): Promise<void> {
    setExportingQuickPdf(true)
    try {
      const [storeRes, currencyRes] = await Promise.all([
        window.electronAPI.settings.get('store.name'),
        window.electronAPI.settings.get('store.currency_symbol'),
      ])
      const storeName = (storeRes?.success ? storeRes.data : null) ?? 'Mahali Garage'
      const sym = (currencyRes?.success ? currencyRes.data : null) ?? 'د.إ'
      const periodLabel = `${dateFrom} → ${dateTo}`
      const money = (n: number): string => `${sym}${n.toFixed(2)}`

      if (tab === 'department_reports') {
        if (!departmentData) {
          toast.error('No data to export')
          return
        }
        const html = buildDepartmentReportsPdf({
          storeName,
          dateFrom,
          dateTo,
          mechanical: departmentData.mechanical,
          programming: departmentData.programming,
          currencySymbol: sym,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      const deptLabelQuick =
        reportDept === 'all' ? 'Both' : reportDept === 'mechanical' ? 'Mechanical' : 'Programming'

      if (tab === 'sales' && compareData?.sales) {
        const [a, b] = compareData.sales
        if (!a.length && !b.length) {
          toast.error('No data to export')
          return
        }
        const aligned = buildAlignedSalesChart(a, b)
        const dailyAligned = aligned.map((p) => ({
          day1: p.day1 ?? '—',
          rev1: p.revenue1,
          day2: p.day2 ?? '—',
          rev2: p.revenue2,
        }))
        const html = buildDailySalesComparisonPdf({
          storeName,
          currency: sym,
          department: deptLabelQuick,
          period1Label: compareData.p1.label,
          period2Label: compareData.p2.label,
          period1From: compareData.p1.from,
          period1To: compareData.p1.to,
          period2From: compareData.p2.from,
          period2To: compareData.p2.to,
          rows1: a.map((row) => ({
            invoice: row.sale_number,
            customer: row.customer_name ?? 'Walk-in',
            car: '—',
            amount: row.total_amount,
            status: row.status,
          })),
          rows2: b.map((row) => ({
            invoice: row.sale_number,
            customer: row.customer_name ?? 'Walk-in',
            car: '—',
            amount: row.total_amount,
            status: row.status,
          })),
          dailyAligned,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'profit' && compareData?.profit) {
        const [pr1, pr2] = compareData.profit
        if (!pr1.length && !pr2.length) {
          toast.error('No data to export')
          return
        }
        const total1 = {
          revenue: pr1.reduce((s, row) => s + row.revenue, 0),
          cost: pr1.reduce((s, row) => s + row.cogs, 0),
          grossProfit: pr1.reduce((s, row) => s + row.gross_profit, 0),
        }
        const total2 = {
          revenue: pr2.reduce((s, row) => s + row.revenue, 0),
          cost: pr2.reduce((s, row) => s + row.cogs, 0),
          grossProfit: pr2.reduce((s, row) => s + row.gross_profit, 0),
        }
        const html = buildProfitComparisonPdf({
          storeName,
          currency: sym,
          department: deptLabelQuick,
          period1Label: compareData.p1.label,
          period2Label: compareData.p2.label,
          period1From: compareData.p1.from,
          period1To: compareData.p1.to,
          period2From: compareData.p2.from,
          period2To: compareData.p2.to,
          total1,
          total2,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'topproducts' && compareData?.top) {
        const merged = mergeTopProducts(compareData.top[0], compareData.top[1])
        if (!merged.length) {
          toast.error('No data to export')
          return
        }
        const html = buildTopProductsComparisonPdf({
          storeName,
          currency: sym,
          department: deptLabelQuick,
          period1Label: compareData.p1.label,
          period2Label: compareData.p2.label,
          period1From: compareData.p1.from,
          period1To: compareData.p1.to,
          period2From: compareData.p2.from,
          period2To: compareData.p2.to,
          rows: merged.map((m) => ({
            product_name: m.product_name,
            qty1: m.qty1,
            rev1: m.rev1,
            qty2: m.qty2,
            rev2: m.rev2,
            deltaRev: m.deltaRev,
            deltaPct: m.deltaPct,
          })),
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'sales') {
        const rows = data as Array<{
          sale_number: string
          invoice_number: string | null
          customer_name: string | null
          total_amount: number
          status: string
        }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const dept =
          reportDept === 'all' ? 'Both' : reportDept === 'mechanical' ? 'Mechanical' : 'Programming'
        const html = buildDailySalesPdf({
          storeName,
          dateFrom,
          dateTo,
          department: dept,
          rows: rows.map(r => ({
            invoice: r.invoice_number ?? r.sale_number,
            customer: r.customer_name ?? 'Walk-in',
            car: '—',
            amount: r.total_amount,
            status: r.status,
          })),
          currency: sym,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'profit') {
        const rows = data as Array<{ revenue: number; cogs: number; gross_profit: number }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
        const totalCost = rows.reduce((s, r) => s + r.cogs, 0)
        const grossProfit = rows.reduce((s, r) => s + r.gross_profit, 0)
        const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
        const dept =
          reportDept === 'all' ? 'Both' : reportDept === 'mechanical' ? 'Mechanical' : 'Programming'
        const html = buildProfitPdf({
          storeName,
          dateFrom,
          dateTo,
          department: dept,
          totalRevenue,
          totalCost,
          grossProfit,
          marginPercent,
          currency: sym,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'topproducts') {
        const rows = (data as Array<{
          product_name: string
          total_qty: number
          total_revenue: number
        }>)
          .slice()
          .sort((a, b) => b.total_revenue - a.total_revenue)
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const dept =
          reportDept === 'all' ? 'Both' : reportDept === 'mechanical' ? 'Mechanical' : 'Programming'
        const html = buildTopServicesPdf({
          storeName,
          dateFrom,
          dateTo,
          department: dept,
          rows: rows.map((row, idx) => ({
            rank: idx + 1,
            serviceName: row.product_name,
            count: row.total_qty,
            revenue: row.total_revenue,
          })),
          currency: sym,
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'inventory') {
        const rows = data as Array<{
          name: string
          sku: string | null
          stock_quantity: number
          unit: string
          cost_price: number
          sell_price: number
          stock_value: number
        }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Inventory Report',
          periodLabel,
          columnLabels: ['Name', 'SKU', 'Stock', 'Cost', 'Price', 'Value'],
          rows: rows.map(r => [
            r.name,
            r.sku ?? '—',
            `${r.stock_quantity} ${r.unit}`,
            money(r.cost_price),
            money(r.sell_price),
            money(r.stock_value),
          ]),
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'lowstock') {
        const rows = data as Array<{
          name: string
          stock_quantity: number
          low_stock_threshold: number
          unit: string
          category: string
          supplier: string
        }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Low Stock Report',
          periodLabel,
          columnLabels: ['Name', 'Stock', 'Threshold', 'Category', 'Supplier'],
          rows: rows.map(r => [
            r.name,
            `${r.stock_quantity} ${r.unit}`,
            String(r.low_stock_threshold),
            r.category,
            r.supplier,
          ]),
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'debts') {
        const rows = data as Array<{
          name: string
          phone: string | null
          sale_count: number
          balance: number
          total_due: number
        }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Customer Debts',
          periodLabel,
          columnLabels: ['Customer', 'Phone', 'Sales', 'Owes'],
          rows: rows.map(r => [
            r.name,
            r.phone ?? '—',
            String(r.sale_count),
            money(reportDept !== 'all' ? r.total_due : Math.abs(r.balance)),
          ]),
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'expenses_category') {
        const rows = data as Array<{ category_name: string | null; total: number }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const grandTotal = rows.reduce((s, r) => s + r.total, 0)
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Expenses by Category',
          periodLabel,
          columnLabels: ['Category', 'Amount', '% of total'],
          rows: rows.map(r => [
            r.category_name ?? 'Uncategorized',
            money(r.total),
            grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : '—',
          ]),
          summaryLines: [{ label: 'Grand total', value: money(grandTotal) }],
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'expenses_monthly') {
        const rows = data as Array<{ month: string; total: number }>
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const grandTotal = rows.reduce((s, r) => s + r.total, 0)
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Monthly Expenses',
          periodLabel: `Year ${dateFrom.slice(0, 4)}`,
          columnLabels: ['Month', 'Amount'],
          rows: rows.map(r => [r.month, money(r.total)]),
          summaryLines: [{ label: 'Total', value: money(grandTotal) }],
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      if (tab === 'assets') {
        type AssetR = {
          name: string
          category: string
          purchase_date: string
          purchase_price: number
          current_value: number | null
        }
        const rows = data as AssetR[]
        const tp = assetsFooter?.total_purchase ?? rows.reduce((s, r) => s + r.purchase_price, 0)
        const tc = assetsFooter?.total_current ?? rows.reduce((s, r) => s + (r.current_value ?? 0), 0)
        if (!rows.length) {
          toast.error('No data to export')
          return
        }
        const html = buildGenericTablePdf({
          storeName,
          reportTitle: 'Assets Report',
          periodLabel,
          columnLabels: ['Name', 'Category', 'Purchase date', 'Purchase price', 'Current value'],
          rows: rows.map(r => [
            r.name,
            r.category,
            formatDate(r.purchase_date),
            money(r.purchase_price),
            r.current_value != null ? money(r.current_value) : '—',
          ]),
          summaryLines: [
            { label: 'Total purchase', value: money(tp) },
            { label: 'Total current value', value: money(tc) },
          ],
        })
        const printRes = await window.electronAPI.print.receipt(html)
        if (!printRes?.success) throw new Error('Print failed')
        return
      }

      toast.error('PDF export is not available for this tab')
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Failed to export PDF'
      toast.error(msg)
    } finally {
      setExportingQuickPdf(false)
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
    if (tab === 'attendance' || tab === 'salary' || tab === 'performance') {
      setLoading(false)
      setData([])
      setDepartmentData(null)
      setAssetsFooter(null)
      setCompareData(null)
      return
    }
    setLoading(true)
    setData([])
    setDepartmentData(null)
    setAssetsFooter(null)

    const compareTabs: ReportTab[] = ['sales', 'profit', 'topproducts']
    if (compareTabs.includes(tab) && periodCompareMode !== 'single') {
      const cmp = resolveComparisonPeriods(periodCompareMode, monthComparePreset, {
        p1From: customP1From,
        p1To: customP1To,
        p2From: customP2From,
        p2To: customP2To,
      })
      if (!cmp) {
        toast.error(t('reports.invalidComparisonRange', { defaultValue: 'Invalid comparison date range' }))
        setCompareData(null)
        setLoading(false)
        return
      }
      const f1 = `${cmp.period1.from} 00:00:00`
      const t1 = `${cmp.period1.to} 23:59:59`
      const f2 = `${cmp.period2.from} 00:00:00`
      const t2 = `${cmp.period2.to} 23:59:59`
      try {
        if (tab === 'sales') {
          const [a, b] = await Promise.all([
            window.electronAPI.reports.salesDaily(f1, t1, reportDept),
            window.electronAPI.reports.salesDaily(f2, t2, reportDept),
          ])
          if (!a?.success || !b?.success) throw new Error(a?.error || b?.error || 'Failed')
          setCompareData({
            p1: cmp.period1,
            p2: cmp.period2,
            sales: [a.data as SaleRow[], b.data as SaleRow[]],
            profit: null,
            top: null,
          })
          setData([])
        } else if (tab === 'profit') {
          const [a, b] = await Promise.all([
            window.electronAPI.reports.profit(f1, t1, reportDept),
            window.electronAPI.reports.profit(f2, t2, reportDept),
          ])
          if (!a?.success || !b?.success) throw new Error(a?.error || b?.error || 'Failed')
          setCompareData({
            p1: cmp.period1,
            p2: cmp.period2,
            sales: null,
            profit: [a.data as ProfitRow[], b.data as ProfitRow[]],
            top: null,
          })
          setData([])
        } else {
          const [a, b] = await Promise.all([
            window.electronAPI.reports.topProducts(f1, t1),
            window.electronAPI.reports.topProducts(f2, t2),
          ])
          if (!a?.success || !b?.success) throw new Error(a?.error || b?.error || 'Failed')
          setCompareData({
            p1: cmp.period1,
            p2: cmp.period2,
            sales: null,
            profit: null,
            top: [a.data as TopProductRow[], b.data as TopProductRow[]],
          })
          setData([])
        }
      } catch {
        toast.error(t('common.error'))
        setCompareData(null)
      } finally {
        setLoading(false)
      }
      return
    }

    setCompareData(null)
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

  useEffect(() => {
    void load()
  }, [
    tab,
    dateFrom,
    dateTo,
    reportDept,
    periodCompareMode,
    monthComparePreset,
    customP1From,
    customP1To,
    customP2From,
    customP2To,
  ])

  useEffect(() => {
    if (tab !== 'performance') return
    void loadPerfPreview()
  }, [tab, loadPerfPreview])

  useEffect(() => {
    if (tab !== 'attendance' && tab !== 'salary' && tab !== 'performance') return
    void (async () => {
      if (tab === 'performance') {
        const res = await window.electronAPI.employees.list({ status: 'active' })
        if (res?.success) {
          setPerfEmployees(
            (res.data as Array<{ id: number; employee_id: string; full_name: string; department: string }>) ?? [],
          )
        }
        return
      }
      const res = await window.electronAPI.employees.list({})
      if (res?.success) {
        const list = (res.data as Array<{ id: number; employee_id: string; full_name: string; department: string }>) ?? []
        setAttendanceEmployees(list)
        setSalaryEmployees(list)
      }
    })()
  }, [tab])

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
    { key: 'attendance',        label: t('reports.attendance', { defaultValue: 'Attendance Report' }) },
    { key: 'salary',            label: t('reports.salary', { defaultValue: 'Salary Report' }) },
    {
      key: 'performance',
      label: t('reports.employeePerformance', { defaultValue: 'Employee Performance' }),
    },
  ]

  const showDateRange = ['sales', 'profit', 'topproducts', 'expenses_category', 'expenses_monthly', 'department_reports'].includes(tab)
  const showDeptFilter = ['sales', 'profit', 'debts', 'expenses_category', 'expenses_monthly'].includes(tab)
  const showComparisonControls = ['sales', 'profit', 'topproducts'].includes(tab)
  const canExportPdf = ['sales', 'profit', 'topproducts'].includes(tab)
  const canQuickExportPdf = QUICK_PDF_TABS.includes(tab)
  const hasQuickPdfData =
    tab === 'department_reports'
      ? departmentData != null
      : compareData != null || data.length > 0

  function handleExportCsvClick(): void {
    if (compareData?.sales && tab === 'sales') {
      const [a, b] = compareData.sales
      const rows: Record<string, unknown>[] = [
        ...a.map((r) => ({
          period: compareData.p1.label,
          sale_number: r.sale_number,
          customer: r.customer_name ?? '',
          total_amount: r.total_amount,
          status: r.status,
          created_at: r.created_at,
        })),
        ...b.map((r) => ({
          period: compareData.p2.label,
          sale_number: r.sale_number,
          customer: r.customer_name ?? '',
          total_amount: r.total_amount,
          status: r.status,
          created_at: r.created_at,
        })),
      ]
      exportCsv(rows, 'sales-comparison.csv')
      return
    }
    if (compareData?.profit && tab === 'profit') {
      const [a, b] = compareData.profit
      const rows: Record<string, unknown>[] = [
        ...a.map((r) => ({
          period: compareData.p1.label,
          day: r.day,
          revenue: r.revenue,
          cogs: r.cogs,
          gross_profit: r.gross_profit,
        })),
        ...b.map((r) => ({
          period: compareData.p2.label,
          day: r.day,
          revenue: r.revenue,
          cogs: r.cogs,
          gross_profit: r.gross_profit,
        })),
      ]
      exportCsv(rows, 'profit-comparison.csv')
      return
    }
    if (compareData?.top && tab === 'topproducts') {
      const merged = mergeTopProducts(compareData.top[0], compareData.top[1])
      exportCsv(
        merged.map((m) => ({
          product: m.product_name,
          qty_period_1: m.qty1,
          revenue_period_1: m.rev1,
          qty_period_2: m.qty2,
          revenue_period_2: m.rev2,
          delta_revenue: m.deltaRev,
          delta_pct: m.deltaPct ?? '',
        })),
        'top-products-comparison.csv',
      )
      return
    }
    exportCsv(data as Record<string, unknown>[], `${tab}-report.csv`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
        <div className="flex items-center gap-2">
          {canExportPdf && (
            <>
              <button
                type="button"
                onClick={() => {
                  setExportModalFormat('pdf')
                  setShowExportModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
              >
                <FileText className="w-4 h-4" />
                {t('reports.exportPdf', { defaultValue: 'Export PDF' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportModalFormat('excel')
                  setShowExportModal(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {t('reports.exportExcel', { defaultValue: 'Export Excel' })}
              </button>
            </>
          )}
          {canQuickExportPdf && (
            <button
              type="button"
              onClick={() => void handleQuickReportPdf()}
              disabled={exportingQuickPdf || !hasQuickPdfData || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50"
              title="Export the current on-screen table and filters to PDF"
            >
              <FileText className="w-4 h-4" />
              {exportingQuickPdf ? 'PDF…' : 'PDF (current view)'}
            </button>
          )}
          {tab !== 'attendance' && tab !== 'salary' && tab !== 'performance' && (
            <button
              type="button"
              onClick={() => handleExportCsvClick()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
            >
              <Download className="w-4 h-4" />{t('reports.exportCsv')}
            </button>
          )}
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
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              disabled={showComparisonControls && periodCompareMode !== 'single'}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t('common.to')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              disabled={showComparisonControls && periodCompareMode !== 'single'}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
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

      {showDateRange && showComparisonControls && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">{t('reports.comparisonMode', { defaultValue: 'Comparison mode' })}</p>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={periodCompareMode}
              onChange={(e) => setPeriodCompareMode(e.target.value as ComparisonMode)}
              className="px-3 py-1.5 text-sm border border-input rounded-md bg-background min-w-[180px]"
            >
              <option value="single">{t('reports.compareSingle', { defaultValue: 'Single period' })}</option>
              <option value="mom">{t('reports.compareMom', { defaultValue: 'Month-over-month' })}</option>
              <option value="qoq">{t('reports.compareQoq', { defaultValue: 'Quarter-over-quarter' })}</option>
              <option value="custom">{t('reports.compareCustom', { defaultValue: 'Custom (two ranges)' })}</option>
            </select>
            {periodCompareMode === 'mom' && (
              <select
                value={monthComparePreset}
                onChange={(e) => setMonthComparePreset(e.target.value as MonthComparisonPreset)}
                className="px-3 py-1.5 text-sm border border-input rounded-md bg-background max-w-[min(100%,320px)]"
              >
                <option value="this_vs_last_month">
                  {t('reports.presetThisVsLast', { defaultValue: 'This month vs last month' })}
                </option>
                <option value="last2_blocks">
                  {t('reports.presetLast2', { defaultValue: 'Last 2 months vs prior 2 months' })}
                </option>
                <option value="last3_blocks">{t('reports.presetLast3', { defaultValue: 'Last 3 months vs prior 3 months' })}</option>
                <option value="last4_blocks">{t('reports.presetLast4', { defaultValue: 'Last 4 months vs prior 4 months' })}</option>
                <option value="last6_blocks">{t('reports.presetLast6', { defaultValue: 'Last 6 months vs prior 6 months' })}</option>
                <option value="ytd_vs_prior">{t('reports.presetYtd', { defaultValue: 'Year-to-date vs same span prior year' })}</option>
              </select>
            )}
          </div>
          {periodCompareMode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 rounded-md border border-border p-3 bg-background">
                <p className="text-xs font-semibold text-muted-foreground">{t('reports.range1', { defaultValue: 'Range 1' })}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-muted-foreground">{t('common.from')}</label>
                  <input
                    type="date"
                    value={customP1From}
                    onChange={(e) => setCustomP1From(e.target.value)}
                    className="px-2 py-1 border border-input rounded-md bg-background text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-muted-foreground">{t('common.to')}</label>
                  <input
                    type="date"
                    value={customP1To}
                    min={customP1From}
                    onChange={(e) => setCustomP1To(e.target.value)}
                    className="px-2 py-1 border border-input rounded-md bg-background text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border p-3 bg-background">
                <p className="text-xs font-semibold text-muted-foreground">{t('reports.range2', { defaultValue: 'Range 2' })}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-muted-foreground">{t('common.from')}</label>
                  <input
                    type="date"
                    value={customP2From}
                    onChange={(e) => setCustomP2From(e.target.value)}
                    className="px-2 py-1 border border-input rounded-md bg-background text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="text-muted-foreground">{t('common.to')}</label>
                  <input
                    type="date"
                    value={customP2To}
                    min={customP2From}
                    onChange={(e) => setCustomP2To(e.target.value)}
                    className="px-2 py-1 border border-input rounded-md bg-background text-sm"
                  />
                </div>
              </div>
            </div>
          )}
          {periodCompareMode === 'qoq' && (
            <p className="text-xs text-muted-foreground">
              {t('reports.qoqHint', { defaultValue: 'Compares the previous full calendar quarter to the current quarter (from quarter start through today).' })}
            </p>
          )}
          {periodCompareMode !== 'single' && (
            <p className="text-xs text-muted-foreground">
              {t('reports.comparisonDateHint', { defaultValue: 'The main From/To filters above are ignored while comparison is active.' })}
            </p>
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

      {tab === 'attendance' ? (
        <div className="space-y-6 max-w-lg">
          <div>
            <h2 className="text-base font-semibold">{t('reports.attendance', { defaultValue: 'Attendance Report' })}</h2>
            <p className="text-sm text-muted-foreground">
              Generate a PDF attendance report for any employee and date range.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Employee</label>
              <select
                value={selectedAttendanceEmp ?? ''}
                onChange={(e) => setSelectedAttendanceEmp(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Select employee...</option>
                {attendanceEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_id})
                    {emp.department ? ` — ${emp.department}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">From</label>
                <input
                  type="date"
                  value={attendanceFromDate}
                  onChange={(e) => setAttendanceFromDate(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">To</label>
                <input
                  type="date"
                  value={attendanceToDate}
                  min={attendanceFromDate}
                  onChange={(e) => setAttendanceToDate(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {[
                {
                  label: 'This Month',
                  fn: () => {
                    const d = new Date()
                    const from = new Date(d.getFullYear(), d.getMonth(), 1)
                    setAttendanceFromDate(from.toISOString().split('T')[0])
                    setAttendanceToDate(d.toISOString().split('T')[0])
                  },
                },
                {
                  label: 'Last Month',
                  fn: () => {
                    const d = new Date()
                    const from = new Date(d.getFullYear(), d.getMonth() - 1, 1)
                    const to = new Date(d.getFullYear(), d.getMonth(), 0)
                    setAttendanceFromDate(from.toISOString().split('T')[0])
                    setAttendanceToDate(to.toISOString().split('T')[0])
                  },
                },
                {
                  label: 'This Year',
                  fn: () => {
                    const d = new Date()
                    setAttendanceFromDate(`${d.getFullYear()}-01-01`)
                    setAttendanceToDate(d.toISOString().split('T')[0])
                  },
                },
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  type="button"
                  onClick={fn}
                  className="px-3 py-1 text-xs border border-border rounded-md hover:bg-muted/50 text-muted-foreground"
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleAttendancePdf()}
              disabled={!selectedAttendanceEmp || !attendanceFromDate || !attendanceToDate || generatingAttendancePdf}
              className="w-full py-2.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {generatingAttendancePdf ? '⏳ Generating...' : '📄 Generate PDF Report'}
            </button>
          </div>
        </div>
      ) : tab === 'salary' ? (
        <div className="space-y-6 max-w-lg">
          <div>
            <h2 className="text-base font-semibold">Salary Report</h2>
            <p className="text-sm text-muted-foreground">
              Generate payslips or salary summary reports for any period.
            </p>
          </div>

          <div className="flex gap-1 p-0.5 bg-muted rounded-md w-fit">
            <button
              type="button"
              onClick={() => setSalaryReportType('all')}
              className={`px-4 py-1.5 text-sm rounded transition-colors ${
                salaryReportType === 'all' ? 'bg-background shadow font-medium' : 'text-muted-foreground'
              }`}
            >
              All Employees Summary
            </button>
            <button
              type="button"
              onClick={() => setSalaryReportType('single')}
              className={`px-4 py-1.5 text-sm rounded transition-colors ${
                salaryReportType === 'single' ? 'bg-background shadow font-medium' : 'text-muted-foreground'
              }`}
            >
              Individual Payslip
            </button>
          </div>

          {salaryReportType === 'single' && (
            <div>
              <label className="text-sm font-medium block mb-1">Employee</label>
              <select
                value={salaryEmployee ?? ''}
                onChange={(e) => setSalaryEmployee(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Select employee...</option>
                {salaryEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {salaryReportType === 'all' && (
            <div>
              <label className="text-sm font-medium block mb-1">Department</label>
              <select
                value={salaryDept}
                onChange={(e) => setSalaryDept(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="all">All Departments</option>
                <option value="mechanical">Mechanical</option>
                <option value="programming">Programming</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">From</label>
              <input
                type="date"
                value={salaryFromDate}
                onChange={(e) => setSalaryFromDate(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">To</label>
              <input
                type="date"
                value={salaryToDate}
                min={salaryFromDate}
                onChange={(e) => setSalaryToDate(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              {
                label: 'This Month',
                fn: () => {
                  const d = new Date()
                  setSalaryFromDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0])
                  setSalaryToDate(d.toISOString().split('T')[0])
                },
              },
              {
                label: 'Last Month',
                fn: () => {
                  const d = new Date()
                  setSalaryFromDate(new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0])
                  setSalaryToDate(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0])
                },
              },
              {
                label: 'This Year',
                fn: () => {
                  const d = new Date()
                  setSalaryFromDate(`${d.getFullYear()}-01-01`)
                  setSalaryToDate(d.toISOString().split('T')[0])
                },
              },
            ].map(({ label, fn }) => (
              <button key={label} type="button" onClick={fn} className="px-3 py-1 text-xs border border-border rounded-md hover:bg-muted/50 text-muted-foreground">
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleSalaryPdf()}
            disabled={generatingSalaryPdf || (salaryReportType === 'single' && !salaryEmployee)}
            className="w-full py-2.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {generatingSalaryPdf
              ? '⏳ Generating...'
              : salaryReportType === 'single'
                ? '📄 Generate Payslip PDF'
                : '📊 Generate Summary PDF'}
          </button>
        </div>
      ) : tab === 'performance' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Employee Performance</h2>
            <p className="text-sm text-muted-foreground">Track jobs, hours and revenue per employee.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Employee</label>
              <select
                value={perfEmployeeId ?? ''}
                onChange={(e) => setPerfEmployeeId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">All Employees</option>
                {perfEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Department</label>
              <select
                value={perfDept}
                onChange={(e) => setPerfDept(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="all">All</option>
                <option value="mechanical">Mechanical</option>
                <option value="programming">Programming</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">From</label>
              <input
                type="date"
                value={perfFromDate}
                onChange={(e) => setPerfFromDate(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">To</label>
              <input
                type="date"
                value={perfToDate}
                min={perfFromDate}
                onChange={(e) => setPerfToDate(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              {
                label: 'This Month',
                fn: () => {
                  const d = new Date()
                  setPerfFromDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0])
                  setPerfToDate(d.toISOString().split('T')[0])
                },
              },
              {
                label: 'Last Month',
                fn: () => {
                  const d = new Date()
                  setPerfFromDate(new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0])
                  setPerfToDate(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0])
                },
              },
              {
                label: 'This Year',
                fn: () => {
                  const d = new Date()
                  setPerfFromDate(`${d.getFullYear()}-01-01`)
                  setPerfToDate(d.toISOString().split('T')[0])
                },
              },
            ].map(({ label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                className="px-3 py-1 text-xs border border-border rounded-md hover:bg-muted/50 text-muted-foreground"
              >
                {label}
              </button>
            ))}
          </div>

          {loadingPerf ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          ) : perfPreview.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
              No performance data for this period. Assign employees to receipts to track performance.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Employee</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Jobs</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">Hours</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perfPreview.map((emp) => (
                    <tr key={emp.employee_code} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-sm">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono capitalize">{emp.department}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold">{emp.total_jobs}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground">
                        {emp.total_hours > 0 ? `${emp.total_hours.toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-primary">{emp.total_revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handlePerfPdf()}
            disabled={generatingPerfPdf || perfPreview.length === 0}
            className="w-full py-2.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {generatingPerfPdf ? '⏳ Generating...' : '📊 Export Performance PDF'}
          </button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <>
          {/* Chart */}
          {tab === 'sales' && compareData?.sales && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <p className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-3">
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#2563eb] align-middle mr-1" aria-hidden />
                  {compareData.p1.label}
                </span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#d97706] align-middle mr-1" aria-hidden />
                  {compareData.p2.label}
                </span>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buildAlignedSalesChart(compareData.sales[0], compareData.sales[1])}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="revenue1" name={compareData.p1.label} fill="#2563eb" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="revenue2" name={compareData.p2.label} fill="#d97706" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'sales' && !compareData?.sales && data.length > 0 && (
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
          {tab === 'profit' && compareData?.profit && (
            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <p className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-3">
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#2563eb] align-middle mr-1" aria-hidden />
                  {compareData.p1.label}
                </span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#d97706] align-middle mr-1" aria-hidden />
                  {compareData.p2.label}
                </span>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={buildAlignedProfitChart(compareData.profit[0], compareData.profit[1])}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue1" name={`${compareData.p1.label} revenue`} stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="revenue2" name={`${compareData.p2.label} revenue`} stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'profit' && !compareData?.profit && data.length > 0 && (
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
          ) : tab === 'sales' && compareData?.sales ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">{compareData.p1.label}</h3>
                <ReportTable tab="sales" data={compareData.sales[0] as unknown[]} reportDept={reportDept} assetsFooter={null} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">{compareData.p2.label}</h3>
                <ReportTable tab="sales" data={compareData.sales[1] as unknown[]} reportDept={reportDept} assetsFooter={null} />
              </div>
            </div>
          ) : tab === 'profit' && compareData?.profit ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">{compareData.p1.label}</h3>
                <ReportTable tab="profit" data={compareData.profit[0] as unknown[]} reportDept={reportDept} assetsFooter={null} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">{compareData.p2.label}</h3>
                <ReportTable tab="profit" data={compareData.profit[1] as unknown[]} reportDept={reportDept} assetsFooter={null} />
              </div>
            </div>
          ) : tab === 'topproducts' && compareData?.top ? (
            <TopProductsComparisonTable rows={mergeTopProducts(compareData.top[0], compareData.top[1])} />
          ) : (
            <ReportTable tab={tab} data={data} reportDept={reportDept} assetsFooter={assetsFooter} />
          )}
        </>
      )}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-base">
                  {t('reports.exportReportTitle', { defaultValue: 'Export report' })}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {exportModalFormat === 'pdf'
                    ? t('reports.exportFormatPdf', { defaultValue: 'Format: PDF (print)' })
                    : t('reports.exportFormatExcel', { defaultValue: 'Format: Excel (.xlsx)' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-md hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {periodCompareMode === 'single' && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">{t('reports.timePeriod', { defaultValue: 'Time Period' })}</p>
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
            )}

            <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">{t('reports.comparisonMode', { defaultValue: 'Comparison mode' })}</p>
              <select
                value={periodCompareMode}
                onChange={(e) => setPeriodCompareMode(e.target.value as ComparisonMode)}
                className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background"
              >
                <option value="single">{t('reports.compareSingle', { defaultValue: 'Single period' })}</option>
                <option value="mom">{t('reports.compareMom', { defaultValue: 'Month-over-month' })}</option>
                <option value="qoq">{t('reports.compareQoq', { defaultValue: 'Quarter-over-quarter' })}</option>
                <option value="custom">{t('reports.compareCustom', { defaultValue: 'Custom (two ranges)' })}</option>
              </select>
              {periodCompareMode === 'mom' && (
                <select
                  value={monthComparePreset}
                  onChange={(e) => setMonthComparePreset(e.target.value as MonthComparisonPreset)}
                  className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background"
                >
                  <option value="this_vs_last_month">
                    {t('reports.presetThisVsLast', { defaultValue: 'This month vs last month' })}
                  </option>
                  <option value="last2_blocks">
                    {t('reports.presetLast2', { defaultValue: 'Last 2 months vs prior 2 months' })}
                  </option>
                  <option value="last3_blocks">{t('reports.presetLast3', { defaultValue: 'Last 3 months vs prior 3 months' })}</option>
                  <option value="last4_blocks">{t('reports.presetLast4', { defaultValue: 'Last 4 months vs prior 4 months' })}</option>
                  <option value="last6_blocks">{t('reports.presetLast6', { defaultValue: 'Last 6 months vs prior 6 months' })}</option>
                  <option value="ytd_vs_prior">{t('reports.presetYtd', { defaultValue: 'Year-to-date vs same span prior year' })}</option>
                </select>
              )}
              {periodCompareMode === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">{t('reports.range1', { defaultValue: 'Range 1' })}</p>
                    <input
                      type="date"
                      value={customP1From}
                      onChange={(e) => setCustomP1From(e.target.value)}
                      className="w-full px-2 py-1 border border-input rounded-md bg-background"
                    />
                    <input
                      type="date"
                      value={customP1To}
                      min={customP1From}
                      onChange={(e) => setCustomP1To(e.target.value)}
                      className="w-full px-2 py-1 border border-input rounded-md bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground">{t('reports.range2', { defaultValue: 'Range 2' })}</p>
                    <input
                      type="date"
                      value={customP2From}
                      onChange={(e) => setCustomP2From(e.target.value)}
                      className="w-full px-2 py-1 border border-input rounded-md bg-background"
                    />
                    <input
                      type="date"
                      value={customP2To}
                      min={customP2From}
                      onChange={(e) => setCustomP2To(e.target.value)}
                      className="w-full px-2 py-1 border border-input rounded-md bg-background"
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
                disabled={exportingModal}
                onClick={() => {
                  setShowExportModal(false)
                  void (exportModalFormat === 'pdf' ? handleExportPdf() : handleExportExcel())
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {exportingModal
                  ? t('reports.exportGenerating', { defaultValue: 'Generating…' })
                  : exportModalFormat === 'pdf'
                    ? t('reports.generatePdf', { defaultValue: 'Generate PDF' })
                    : t('reports.generateExcel', { defaultValue: 'Generate Excel' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TopProductsComparisonTable({ rows }: { rows: MergedTopProduct[] }): JSX.Element {
  const { t } = useTranslation()
  if (!rows.length) {
    return <p className="py-8 text-center text-muted-foreground text-sm">{t('common.noData')}</p>
  }
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
            <th className="text-end px-3 py-3 font-medium">Qty P1</th>
            <th className="text-end px-3 py-3 font-medium">Rev P1</th>
            <th className="text-end px-3 py-3 font-medium">Qty P2</th>
            <th className="text-end px-3 py-3 font-medium">Rev P2</th>
            <th className="text-end px-3 py-3 font-medium">Δ Rev</th>
            <th className="text-end px-3 py-3 font-medium">Δ %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => {
            const pct = pctChange(r.rev1, r.rev2)
            return (
              <tr key={`${r.product_name}-${i}`} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.product_name}</td>
                <td className="px-3 py-3 text-end">{r.qty1}</td>
                <td className="px-3 py-3 text-end tabular-nums">
                  <CurrencyText amount={r.rev1} />
                </td>
                <td className="px-3 py-3 text-end">{r.qty2}</td>
                <td className="px-3 py-3 text-end tabular-nums">
                  <CurrencyText amount={r.rev2} />
                </td>
                <td className="px-3 py-3 text-end tabular-nums">
                  <CurrencyText amount={r.deltaRev} />
                </td>
                <td className="px-3 py-3 text-end text-muted-foreground text-xs">{pct.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
