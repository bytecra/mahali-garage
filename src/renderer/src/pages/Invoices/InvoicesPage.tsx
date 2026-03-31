import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Eye, ChevronLeft, ChevronRight, FileText, CalendarDays, X, Trash2, Printer } from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '../../lib/utils'
import { FeatureGate } from '../../components/FeatureGate'
import { toast } from '../../store/notificationStore'

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
  source_type: SourceType
  invoice_id?: number | null
}

const PAGE_SIZE = 20

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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewOpen, setViewOpen] = useState(false)
  const [viewRow, setViewRow] = useState<InvoiceRow | null>(null)

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

      const mappedSales: InvoiceRow[] = salesRows.map(s => ({
        id: Number(s.id),
        invoice_number: String(s.invoice_number || s.sale_number || ''),
        created_at: String(s.created_at || ''),
        customer_name: (s.customer_name as string | null) ?? null,
        car: null,
        department: (s.department as string | null) ?? null,
        amount: Number(s.total_amount || 0),
        payment_method: (s.payment_method as string | null) ?? null,
        source_type: 'invoice',
        invoice_id: (s.invoice_id as number | null) ?? null,
      }))

      const mappedCustom: InvoiceRow[] = customRows.map(r => ({
        id: Number(r.id),
        invoice_number: String(r.receipt_number || ''),
        created_at: String(r.created_at || ''),
        customer_name: (r.customer_name as string | null) ?? null,
        car: [r.plate_number, r.car_company, r.car_model].filter(Boolean).join(' • ') || null,
        department: (r.department as string | null) ?? null,
        amount: Number(r.amount || 0),
        payment_method: (r.payment_method as string | null) ?? null,
        source_type: Number(r.smart_recipe || 0) === 1 ? 'smart' : 'custom',
      }))

      const merged = [...mappedSales, ...mappedCustom]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const start = (p - 1) * PAGE_SIZE
      setRows(merged.slice(start, start + PAGE_SIZE))
      setTotal(merged.length)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [search, dateFrom, dateTo])

  useEffect(() => { void loadData(1) }, [loadData])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
    const receipt = res.data as Record<string, unknown>
    const html = `<html><body><h3>${String(receipt.receipt_number || '')}</h3><p>${String(receipt.customer_name || '')}</p><p>${formatCurrency(Number(receipt.amount || 0))}</p></body></html>`
    const win = window.open('', '_blank', 'width=320,height=600')
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => { win.print(); win.close() }, 300) }
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
                  <td className="px-4 py-3 text-end font-medium">{formatCurrency(row.amount)}</td>
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
                      <button onClick={() => void handleDelete(row)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
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
          <p className="text-sm text-muted-foreground">{t('invoices.page', { current: page, total: totalPages })}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => void loadData(page - 1)} disabled={page <= 1} className="p-1.5 rounded border border-input bg-background hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => void loadData(page + 1)} disabled={page >= totalPages} className="p-1.5 rounded border border-input bg-background hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
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
            <p className="text-sm font-semibold">{formatCurrency(viewRow.amount)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
