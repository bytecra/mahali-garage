import { pdf } from '@react-pdf/renderer'
import { InvoicePDF, type InvoiceData } from '../components/pdf/InvoicePDF'

/**
 * Loads POS sale + settings and builds the same invoice payload used by POS / InvoicePDF.
 */
export async function fetchInvoiceDataForSale(saleId: number): Promise<InvoiceData | null> {
  const [saleRes, settingsRes] = await Promise.all([
    window.electronAPI.sales.getById(saleId),
    window.electronAPI.settings.getAll(),
  ])
  if (!saleRes.success || !saleRes.data) return null

  const s = saleRes.data as Record<string, unknown>
  const settings =
    settingsRes.success && settingsRes.data ? (settingsRes.data as Record<string, string>) : {}

  const invoiceNo =
    (typeof s.invoice_number === 'string' && s.invoice_number.trim()) ||
    (typeof s.sale_number === 'string' && s.sale_number.trim()) ||
    `SALE-${saleId}`

  return {
    invoice_number: invoiceNo,
    sale_number: s.sale_number as string,
    created_at: s.created_at as string,
    customer_name: s.customer_name as string | null,
    cashier_name: s.cashier_name as string | null,
    items: s.items as InvoiceData['items'],
    subtotal: s.subtotal as number,
    discount_amount: s.discount_amount as number,
    tax_enabled: !!s.tax_enabled,
    tax_rate: s.tax_rate as number,
    tax_amount: s.tax_amount as number,
    total_amount: s.total_amount as number,
    amount_paid: s.amount_paid as number,
    balance_due: s.balance_due as number,
    notes: s.notes as string | null,
    store_name: settings['store.name'],
    store_address: settings['store.address'],
    store_phone: settings['store.phone'],
    invoice_footer: settings['invoice.footer_text'],
    currency_symbol: settings['store.currency_symbol'] ?? 'د.إ',
    currency_code: settings['store.currency'] ?? 'AED',
    store_logo: settings['store_logo'] || undefined,
  }
}

/** Download PDF (same behavior as POS after checkout). */
export async function downloadSaleInvoicePdf(saleId: number): Promise<boolean> {
  const inv = await fetchInvoiceDataForSale(saleId)
  if (!inv) return false
  const blob = await pdf(<InvoicePDF inv={inv} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${inv.invoice_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

/**
 * Opens the invoice PDF in a new window so the user can print from the system PDF viewer.
 * Replaces the broken `invoices:print` IPC (never registered in main).
 */
export async function openSaleInvoicePdfForPrint(saleId: number): Promise<boolean> {
  const inv = await fetchInvoiceDataForSale(saleId)
  if (!inv) return false
  const blob = await pdf(<InvoicePDF inv={inv} />).toBlob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }, 120_000)
  return true
}
