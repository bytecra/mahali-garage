import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Printer, Trash2, Search } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import { useBrandingStore } from '../../store/brandingStore'
import CustomReceiptModal from './CustomReceiptModal'

interface Receipt {
  id: number
  receipt_number: string
  customer_name: string
  plate_number: string
  car_type: string
  services_description: string
  amount: number
  payment_method: string
  notes: string
  created_by_name: string | null
  created_at: string
}

export default function CustomReceiptsPage(): JSX.Element {
  const { t } = useTranslation()
  const { appName } = useBrandingStore()
  const user = useAuthStore(s => s.user)
  const role = user?.role
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const canCreate = ['owner', 'manager'].includes(role ?? '')
  const canDelete = ['owner', 'manager'].includes(role ?? '')

  const load = useCallback(async () => {
    try {
      const res = await window.electronAPI.customReceipts.list({
        search: search || undefined,
        page,
        pageSize: 50,
      }) as { success: boolean; data?: { rows: Receipt[]; total: number } }
      if (res.success && res.data) {
        setReceipts(res.data.rows)
        setTotal(res.data.total)
      }
    } catch { /* */ } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => { load() }, [load])

  function handlePrint(receipt: Receipt): void {
    const date = new Date(receipt.created_at).toLocaleString()
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 12px; margin: 2px 0 8px; font-weight: normal; }
  .services { white-space: pre-wrap; margin: 4px 0; }
  .total { font-size: 16px; font-weight: bold; }
  .footer { margin-top: 12px; font-size: 11px; }
</style></head><body>
<div class="center"><h1>${appName}</h1><h2>Auto Repair &amp; Service</h2></div>
<div class="line"></div>
<div class="row"><span>Receipt:</span><span class="bold">${receipt.receipt_number}</span></div>
<div class="row"><span>Date:</span><span>${date}</span></div>
<div class="line"></div>
<div class="row"><span>Customer:</span><span>${receipt.customer_name}</span></div>
<div class="row"><span>Plate:</span><span class="bold">${receipt.plate_number}</span></div>
<div class="row"><span>Vehicle:</span><span>${receipt.car_type}</span></div>
<div class="line"></div>
<div class="bold">Services:</div>
<div class="services">${receipt.services_description || '—'}</div>
<div class="line"></div>
<div class="row"><span class="total">Total:</span><span class="total">$${Number(receipt.amount).toFixed(2)}</span></div>
<div class="row"><span>Payment:</span><span>${receipt.payment_method}</span></div>
${receipt.notes ? `<div class="line"></div><div>Notes: ${receipt.notes}</div>` : ''}
<div class="line"></div>
<div class="center footer">
  <p>Thank you for your business!</p>
  <p>Served by: ${receipt.created_by_name || 'Staff'}</p>
</div>
</body></html>`

    const win = window.open('', '_blank', 'width=350,height=600')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.print(); win.close() }, 400)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setDeleting(id)
    try {
      await window.electronAPI.customReceipts.delete(id)
      load()
    } catch { /* */ } finally {
      setDeleting(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('customReceipts.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-56"
              placeholder={t('common.search') + '...'}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          {canCreate && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4" />
              {t('customReceipts.newReceipt')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{t('common.noData')}</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.receiptNumber')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.customerName')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.plateNumber')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.carType')}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.amount')}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('customReceipts.paymentMethod')}</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.receipt_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{r.customer_name}</td>
                    <td className="px-4 py-3 font-mono font-medium">{r.plate_number}</td>
                    <td className="px-4 py-3">{r.car_type}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.payment_method === 'Cash' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                        r.payment_method === 'Card' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' :
                        'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400'
                      }`}>{r.payment_method}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handlePrint(r)} title={t('customReceipts.printReceipt')}
                          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                          <Printer className="w-4 h-4" />
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                            title={t('common.delete')}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {total} {t('customReceipts.title').toLowerCase()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50 hover:bg-accent">
                  {t('common.previous')}
                </button>
                <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50 hover:bg-accent">
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <CustomReceiptModal open={showModal} onClose={() => setShowModal(false)} onCreated={load} />
    </div>
  )
}
