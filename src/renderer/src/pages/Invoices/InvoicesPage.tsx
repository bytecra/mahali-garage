import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Eye, ChevronLeft, ChevronRight, FileText, CalendarDays, X, Trash2, Printer, Download } from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '../../lib/utils'
import { printCustomReceiptA4 } from '../../lib/printCustomReceiptA4'
import { FeatureGate } from '../../components/FeatureGate'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import CurrencyText from '../../components/shared/CurrencyText'
import { toast } from '../../store/notificationStore'
import ExcelJS from 'exceljs'

type SourceType = 'invoice' | 'custom' | 'smart'

interface InvoiceRow {
  id: number
  invoice_number: string
  created_at: string
  customer_name: string | null
  car: string | null
  department: string | null
  amount: number
  payment_method: string | null
  paid_amount: number
  change_amount: number
  due_amount: number
  status: string
  source_type: SourceType
  invoice_id?: number | null
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export default function InvoicesPage(): JSX.Element {
  return (
    <FeatureGate feature="invoices.view">
      <InvoicesPageInner />
    </FeatureGate>
  )
}

function InvoicesPageInner(): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewOpen, setViewOpen] = useState(false)
  const [viewRow, setViewRow] = useState<InvoiceRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRow | null>(null)
  const [changeSort, setChangeSort] = useState<'none' | 'asc' | 'desc'>('none')
  const [withChangeOnly, setWithChangeOnly] = useState(false)
  const [includeSignatures, setIncludeSignatures] = useState(() => {
    try {
      return localStorage.getItem('invoiceIncludeSignatures') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('invoiceIncludeSignatures', includeSignatures ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [includeSignatures])

  useEffect(() => {
    if (!viewOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        setIncludeSignatures(s => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewOpen])

  const loadData = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const [salesRes, customRes] = await Promise.all([
        window.electronAPI.sales.list({
          search: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page: 1,
          pageSize: 5000,
        }),
        window.electronAPI.customReceipts.list({
          search: search || undefined,
          startDate: dateFrom || undefined,
          endDate: dateTo || undefined,
          page: 1,
          pageSize: 5000,
        }),
      ])

      const salesRows = salesRes.success && salesRes.data ? (salesRes.data as { rows: Array<Record<string, unknown>> }).rows : []
      const customRows = customRes.success && customRes.data ? (customRes.data as { rows: Array<Record<string, unknown>> }).rows : []

      const mappedSales: InvoiceRow[] = salesRows.map(s => {
        const totalAmount = Number(s.total_amount || 0)
        const paidAmount = Number(s.amount_paid || 0)
        const dueAmount = Math.max(0, Number(s.balance_due || 0))
        return {
        id: Number(s.id),
        invoice_number: String(s.invoice_number || s.sale_number || ''),
        created_at: String(s.created_at || ''),
        customer_name: (s.customer_name as string | null) ?? null,
        car: null,
        department: (s.department as string | null) ?? null,
        amount: totalAmount,
        payment_method: (s.payment_method as string | null) ?? null,
        paid_amount: paidAmount,
        change_amount: 0,
        due_amount: dueAmount,
        status: String(s.status || 'completed'),
        source_type: 'invoice',
        invoice_id: (s.invoice_id as number | null) ?? null,
        }
      })

      const mappedCustom: InvoiceRow[] = customRows.map(r => {
        const totalAmount = Number(r.amount || 0)
        const paymentMethod = (r.payment_method as string | null) ?? null
        const isCash = String(paymentMethod ?? '').toLowerCase() === 'cash'
        const paidAmount = isCash ? Number(r.cash_received ?? totalAmount) : totalAmount
        const changeAmount = isCash ? Math.max(0, Number(r.change_amount ?? (paidAmount - totalAmount))) : 0
        return {
        id: Number(r.id),
        invoice_number: String(r.receipt_number || ''),
        created_at: String(r.created_at || ''),
        customer_name: (r.customer_name as string | null) ?? null,
        car: [r.plate_number, r.car_company, r.car_model].filter(Boolean).join(' • ') || null,
        department: (r.department as string | null) ?? null,
        amount: totalAmount,
        payment_method: paymentMethod,
        paid_amount: paidAmount,
        change_amount: changeAmount,
        due_amount: 0,
        status: 'completed',
        source_type: Number(r.smart_recipe || 0) === 1 ? 'smart' : 'custom',
        }
      })

      let merged = [...mappedSales, ...mappedCustom]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (withChangeOnly) merged = merged.filter((r) => r.change_amount > 0)
      if (changeSort === 'asc') merged = merged.slice().sort((a, b) => a.change_amount - b.change_amount)
      if (changeSort === 'desc') merged = merged.slice().sort((a, b) => b.change_amount - a.change_amount)
      const start = (p - 1) * pageSize
      setRows(merged.slice(start, start + pageSize))
      setTotal(merged.length)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [search, dateFrom, dateTo, pageSize, withChangeOnly, changeSort])

  const exportCsv = (): void => {
    if (!rows.length) return
    const records = rows.map((r) => ({
      invoice_number: r.invoice_number,
      customer: r.customer_name ?? 'Walk-in Customer',
      date: r.created_at,
      total_aed: r.amount.toFixed(2),
      paid_aed: r.paid_amount.toFixed(2),
      change_aed: r.change_amount.toFixed(2),
      due_aed: r.due_amount.toFixed(2),
      payment_method: r.payment_method ?? '',
      status: r.status,
      source: r.source_type,
    }))
    const headers = Object.keys(records[0] ?? {})
    const csv = [headers.join(','), ...records.map((rec) => headers.map((h) => JSON.stringify(rec[h as keyof typeof rec] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = async (): Promise<void> => {
    if (!rows.length) return
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Transactions')
    ws.getRow(1).values = ['Invoice', 'Customer', 'Date', 'Total (AED)', 'Paid (AED)', 'Change (AED)', 'Due (AED)', 'Payment', 'Status', 'Source']
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    for (let c = 1; c <= 10; c++) ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    let r = 2
    for (const row of rows) {
      ws.getRow(r).values = [
        row.invoice_number,
        row.customer_name ?? 'Walk-in Customer',
        row.created_at.slice(0, 19).replace('T', ' '),
        row.amount,
        row.paid_amount,
        row.change_amount,
        row.due_amount,
        row.payment_method ?? '—',
        row.status,
        row.source_type,
      ]
      ws.getCell(r, 4).numFmt = '#,##0.00'
      ws.getCell(r, 5).numFmt = '#,##0.00'
      ws.getCell(r, 6).numFmt = '#,##0.00'
      ws.getCell(r, 7).numFmt = '#,##0.00'
      if (row.change_amount > 0) {
        ws.getCell(r, 6).font = { bold: true, color: { argb: 'FF047857' } }
        ws.getCell(r, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
      }
      r++
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.columns.forEach((col) => { col.width = 18 })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => { void loadData(1) }, [loadData])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(total, page * pageSize)

  async function handleDelete(row: InvoiceRow): Promise<void> {
    if (row.source_type === 'invoice') {
      await window.electronAPI.sales.void(row.id, 'Deleted from Invoices page')
    } else {
      await window.electronAPI.customReceipts.delete(row.id)
    }
    toast.success(t('common.deleted'))
    await loadData(page)
  }

  async function handlePrint(row: InvoiceRow): Promise<void> {
    if (row.source_type === 'invoice') {
      if (row.invoice_id) await window.electronAPI.invoices.print(row.invoice_id)
      return
    }
    const res = await window.electronAPI.customReceipts.getById(row.id)
    if (!res.success || !res.data) return
    await printCustomReceiptA4(res.data as Parameters<typeof printCustomReceiptA4>[0], {
      includeSignatures,
    })
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('invoices.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} {t('invoices.records')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('invoices.searchPlaceholder')} className="w-full ps-9 pe-3 py-2 text-sm rounded-md border border-input bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="py-2 px-3 text-sm rounded-md border border-input bg-background" />
          <span className="text-muted-foreground text-sm">–</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="py-2 px-3 text-sm rounded-md border border-input bg-background" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            className="rounded border-input"
            checked={includeSignatures}
            onChange={e => setIncludeSignatures(e.target.checked)}
          />
          Include Signatures
        </label>
        <div className="ms-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
            <input
              type="checkbox"
              className="rounded border-input"
              checked={withChangeOnly}
              onChange={(e) => { setWithChangeOnly(e.target.checked); setPage(1) }}
            />
            With change only
          </label>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted">
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button type="button" onClick={() => void exportExcel()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted">
            <Download className="w-4 h-4" />
            Excel
          </button>
          <label className="text-sm text-muted-foreground">Records per page</label>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
            className="py-2 px-3 text-sm rounded-md border border-input bg-background"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2"><FileText className="w-10 h-10 opacity-30" /><p>{t('common.noData')}</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">Invoice/Receipt</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('invoices.customer')}</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">Car</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">Department</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('common.total')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">Paid</th>
                <th
                  className="px-4 py-3 text-end font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => setChangeSort((s) => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'))}
                  title="Sort by change amount"
                >
                  Change {changeSort === 'desc' ? '↓' : changeSort === 'asc' ? '↑' : ''}
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">Due</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Payment</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.source_type}-${row.id}`} className={cn('border-b border-border last:border-0 hover:bg-muted/30', idx % 2 === 1 && 'bg-muted/10')}>
                  <td className="px-4 py-3 font-mono">{row.invoice_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.created_at)}</td>
                  <td className="px-4 py-3">{row.customer_name || t('pos.walkIn')}</td>
                  <td className="px-4 py-3">{row.car || '—'}</td>
                  <td className="px-4 py-3">{row.department || '—'}</td>
                  <td className="px-4 py-3 text-end font-medium"><CurrencyText amount={row.amount} /></td>
                  <td className="px-4 py-3 text-end tabular-nums"><CurrencyText amount={row.paid_amount} /></td>
                  <td className={cn('px-4 py-3 text-end tabular-nums', row.change_amount > 0 && 'bg-emerald-50 text-emerald-700 font-semibold dark:bg-emerald-950/30 dark:text-emerald-400')}>
                    {row.change_amount > 0
                      ? <CurrencyText amount={row.change_amount} />
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums"><CurrencyText amount={row.due_amount} /></td>
                  <td className="px-4 py-3 text-center text-xs">{row.status}</td>
                  <td className="px-4 py-3 text-center text-xs">{row.payment_method || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      row.source_type === 'invoice' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : row.source_type === 'smart' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    )}>
                      {row.source_type === 'invoice' ? 'Invoice' : row.source_type === 'smart' ? 'Smart Recipe' : 'Custom Recipe'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => { setViewRow(row); setViewOpen(true) }} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => void handlePrint(row)} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"><Printer className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(row)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Showing {rangeStart}-{rangeEnd} of {total} records</p>
            <p className="text-xs text-muted-foreground">Total change in view: {formatCurrency(rows.reduce((s, r) => s + r.change_amount, 0))}</p>
            <p className="text-xs text-muted-foreground">{t('invoices.page', { current: page, total: totalPages })}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => void loadData(page - 1)} disabled={page <= 1} className="px-2.5 py-1.5 text-sm rounded border border-input bg-background hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" />Previous</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = start + i
              return p <= totalPages ? (
                <button
                  key={p}
                  onClick={() => void loadData(p)}
                  className={cn(
                    'w-8 h-8 text-sm rounded border transition-colors',
                    p === page ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-muted'
                  )}
                >
                  {p}
                </button>
              ) : null
            })}
            <button onClick={() => void loadData(page + 1)} disabled={page >= totalPages} className="px-2.5 py-1.5 text-sm rounded border border-input bg-background hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1">Next<ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {viewOpen && viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{viewRow.invoice_number}</h2>
              <button onClick={() => setViewOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm">{formatDateTime(viewRow.created_at)}</p>
            <p className="text-sm">{viewRow.customer_name || t('pos.walkIn')}</p>
            <p className="text-sm">{viewRow.car || '—'}</p>
            <p className="text-sm">{viewRow.department || '—'}</p>
            <p className="text-sm font-semibold"><CurrencyText amount={viewRow.amount} /></p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title={t('common.delete')}
        message={
          deleteTarget
            ? `Are you sure you want to delete invoice ${deleteTarget.invoice_number}? This action cannot be undone.`
            : ''
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return
          void handleDelete(deleteTarget)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
