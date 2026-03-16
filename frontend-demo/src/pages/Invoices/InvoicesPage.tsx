import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, FileDown, Eye, ChevronLeft, ChevronRight,
  FileText, CalendarDays, X,
} from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { cn, formatCurrency, formatDateTime } from '../../lib/utils'
import { FeatureGate } from '../../components/FeatureGate'
import { toast } from '../../store/notificationStore'
import { InvoicePDF, type InvoiceData } from '../../components/pdf/InvoicePDF'

interface SaleRow {
  id: number
  sale_number: string
  invoice_number: string | null
  customer_name: string | null
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  created_at: string
}

interface SaleDetail extends SaleRow {
  subtotal: number
  discount_amount: number
  tax_enabled: number
  tax_rate: number
  tax_amount: number
  notes: string | null
  cashier_name?: string | null
  items: {
    product_name: string
    product_sku: string | null
    quantity: number
    unit_price: number
    discount: number
    line_total: number
  }[]
  payments: { method: string; amount: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  voided:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
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

  // List state
  const [rows, setRows] = useState<SaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSale, setDetailSale] = useState<SaleDetail | null>(null)

  // PDF generation tracker
  const [generatingId, setGeneratingId] = useState<number | null>(null)

  // ── Load list ─────────────────────────────────────────────────────────────
  const loadSales = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await window.electronAPI.sales.list({
        search: search || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: p,
        pageSize: PAGE_SIZE,
      })
      if (res.success && res.data) {
        const d = res.data as { rows: SaleRow[]; total: number }
        setRows(d.rows ?? [])
        setTotal(d.total ?? 0)
        setPage(p)
      }
    } finally {
      setLoading(false)
    }
  }, [search, status, dateFrom, dateTo])

  useEffect(() => { loadSales(1) }, [loadSales])

  // ── Download PDF ──────────────────────────────────────────────────────────
  const downloadPDF = async (saleId: number, invoiceNumber: string) => {
    setGeneratingId(saleId)
    try {
      const [saleRes, settingsRes] = await Promise.all([
        window.electronAPI.sales.getById(saleId),
        window.electronAPI.settings.getAll(),
      ])
      if (!saleRes.success || !saleRes.data) { toast.error(t('common.error')); return }

      const s = saleRes.data as Record<string, unknown>
      const settings = (settingsRes.success && settingsRes.data)
        ? settingsRes.data as Record<string, string>
        : {}

      const inv: InvoiceData = {
        invoice_number:  invoiceNumber,
        sale_number:     s.sale_number as string,
        created_at:      s.created_at as string,
        customer_name:   s.customer_name as string | null,
        cashier_name:    s.cashier_name as string | null,
        items:           s.items as InvoiceData['items'],
        subtotal:        s.subtotal as number,
        discount_amount: s.discount_amount as number,
        tax_enabled:     !!(s.tax_enabled),
        tax_rate:        s.tax_rate as number,
        tax_amount:      s.tax_amount as number,
        total_amount:    s.total_amount as number,
        amount_paid:     s.amount_paid as number,
        balance_due:     s.balance_due as number,
        notes:           s.notes as string | null,
        store_name:      settings['store.name'],
        store_address:   settings['store.address'],
        store_phone:     settings['store.phone'],
        invoice_footer:  settings['invoice.footer_text'],
      }

      const blob = await pdf(<InvoicePDF inv={inv} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber || `sale-${saleId}`}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('invoices.downloaded'))
    } catch (e) {
      console.error('PDF generation failed', e)
      toast.error(t('common.error'))
    } finally {
      setGeneratingId(null)
    }
  }

  // ── View detail ───────────────────────────────────────────────────────────
  const openDetail = async (saleId: number) => {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const res = await window.electronAPI.sales.getById(saleId)
      if (res.success && res.data) {
        setDetailSale(res.data as SaleDetail)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('invoices.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} {t('invoices.records')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('invoices.searchPlaceholder')}
            className="w-full ps-9 pe-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Status */}
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="py-2 px-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('common.all')}</option>
          <option value="completed">{t('invoices.status.completed')}</option>
          <option value="partial">{t('invoices.status.partial')}</option>
          <option value="voided">{t('invoices.status.voided')}</option>
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="py-2 px-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="py-2 px-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <FileText className="w-10 h-10 opacity-30" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('invoices.invoice')}</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t('invoices.customer')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('common.total')}</th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t('invoices.paid')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                    idx % 2 === 1 && 'bg-muted/10'
                  )}
                >
                  {/* Invoice # */}
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-foreground">
                      {row.invoice_number || row.sale_number}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDateTime(row.created_at)}
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-3 text-foreground">
                    {row.customer_name ?? <span className="text-muted-foreground italic">{t('pos.walkIn')}</span>}
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-end font-medium text-foreground">
                    {formatCurrency(row.total_amount)}
                  </td>

                  {/* Paid */}
                  <td className="px-4 py-3 text-end">
                    <span className={row.balance_due > 0 ? 'text-amber-600' : 'text-green-600'}>
                      {formatCurrency(row.amount_paid)}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      STATUS_COLORS[row.status] ?? STATUS_COLORS.pending
                    )}>
                      {t(`invoices.status.${row.status}`, { defaultValue: row.status })}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* View details */}
                      <button
                        onClick={() => openDetail(row.id)}
                        title={t('invoices.viewDetails')}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Download PDF */}
                      <button
                        onClick={() => downloadPDF(row.id, row.invoice_number ?? row.sale_number)}
                        disabled={generatingId === row.id || row.status === 'voided'}
                        title={t('invoices.downloadPdf')}
                        className={cn(
                          'p-1.5 rounded transition-colors',
                          row.status === 'voided'
                            ? 'text-muted-foreground/40 cursor-not-allowed'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                        )}
                      >
                        {generatingId === row.id
                          ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          : <FileDown className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('invoices.page', { current: page, total: totalPages })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => loadSales(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded border border-input bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = start + i
              return p <= totalPages ? (
                <button
                  key={p}
                  onClick={() => loadSales(p)}
                  className={cn(
                    'w-8 h-8 text-sm rounded border transition-colors',
                    p === page
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input bg-background hover:bg-muted'
                  )}
                >
                  {p}
                </button>
              ) : null
            })}
            <button
              onClick={() => loadSales(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-input bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {detailSale
                  ? detailSale.invoice_number ?? detailSale.sale_number
                  : t('invoices.viewDetails')}
              </h2>
              <button
                onClick={() => { setDetailOpen(false); setDetailSale(null) }}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {detailLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : detailSale ? (
                <>
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase mb-1">{t('common.date')}</p>
                      <p className="font-medium">{formatDateTime(detailSale.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase mb-1">{t('invoices.customer')}</p>
                      <p className="font-medium">{detailSale.customer_name ?? t('pos.walkIn')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase mb-1">{t('invoices.cashier')}</p>
                      <p className="font-medium">{detailSale.cashier_name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase mb-1">{t('common.status')}</p>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        STATUS_COLORS[detailSale.status] ?? STATUS_COLORS.pending
                      )}>
                        {t(`invoices.status.${detailSale.status}`, { defaultValue: detailSale.status })}
                      </span>
                    </div>
                  </div>

                  {/* Items table */}
                  <div>
                    <h3 className="font-semibold text-foreground mb-2 text-sm">{t('invoices.items')}</h3>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border">
                            <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t('common.name')}</th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground">{t('common.quantity')}</th>
                            <th className="px-3 py-2 text-end font-medium text-muted-foreground">{t('common.price')}</th>
                            <th className="px-3 py-2 text-end font-medium text-muted-foreground">{t('common.total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailSale.items?.map((item, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-2">
                                <p>{item.product_name}</p>
                                {item.product_sku && (
                                  <p className="text-xs text-muted-foreground">{item.product_sku}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">{item.quantity}</td>
                              <td className="px-3 py-2 text-end">{formatCurrency(item.unit_price)}</td>
                              <td className="px-3 py-2 text-end font-medium">{formatCurrency(item.line_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <div className="flex gap-12">
                      <span className="text-muted-foreground">{t('common.subtotal')}</span>
                      <span>{formatCurrency(detailSale.subtotal)}</span>
                    </div>
                    {detailSale.discount_amount > 0 && (
                      <div className="flex gap-12">
                        <span className="text-muted-foreground">{t('common.discount')}</span>
                        <span className="text-red-500">-{formatCurrency(detailSale.discount_amount)}</span>
                      </div>
                    )}
                    {detailSale.tax_enabled > 0 && detailSale.tax_amount > 0 && (
                      <div className="flex gap-12">
                        <span className="text-muted-foreground">Tax ({detailSale.tax_rate}%)</span>
                        <span>{formatCurrency(detailSale.tax_amount)}</span>
                      </div>
                    )}
                    <div className="flex gap-12 font-bold text-base border-t border-border pt-1 mt-1">
                      <span>{t('common.total')}</span>
                      <span>{formatCurrency(detailSale.total_amount)}</span>
                    </div>
                    <div className="flex gap-12">
                      <span className="text-muted-foreground">{t('invoices.paid')}</span>
                      <span className="text-green-600">{formatCurrency(detailSale.amount_paid)}</span>
                    </div>
                    {detailSale.balance_due > 0 && (
                      <div className="flex gap-12">
                        <span className="text-amber-600 font-medium">{t('pos.balanceDue')}</span>
                        <span className="text-amber-600 font-medium">{formatCurrency(detailSale.balance_due)}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment methods */}
                  {detailSale.payments?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-foreground mb-2 text-sm">{t('invoices.payments')}</h3>
                      <div className="flex flex-wrap gap-2">
                        {detailSale.payments.map((p, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
                            <span className="capitalize">{t(`pos.${p.method}`, { defaultValue: p.method })}</span>
                            <span className="font-bold">{formatCurrency(p.amount)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {detailSale.notes && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-medium mb-1">{t('common.notes')}</p>
                      <p>{detailSale.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">{t('common.error')}</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => { setDetailOpen(false); setDetailSale(null) }}
                className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted transition-colors"
              >
                {t('common.close')}
              </button>
              {detailSale && detailSale.status !== 'voided' && (
                <button
                  onClick={() => downloadPDF(
                    detailSale.id,
                    detailSale.invoice_number ?? detailSale.sale_number
                  )}
                  disabled={generatingId === detailSale.id}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {generatingId === detailSale.id
                    ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <FileDown className="w-4 h-4" />
                  }
                  {t('invoices.downloadPdf')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
