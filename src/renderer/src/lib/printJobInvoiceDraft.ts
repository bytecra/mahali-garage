import { buildInspectionSection } from './printCustomReceiptA4'
import { type DateFormatOption, formatDateByPattern } from '../store/dateFormatStore'

function escapeHtml(v: string): string {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function currency(n: number, symbol: string): string {
  const safe = Number.isFinite(n) ? n : 0
  const sign = safe < 0 ? '-' : ''
  const formatted = Math.abs(safe).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${formatted}${symbol}`
}

function toDateFormat(value: string | undefined): DateFormatOption {
  const v = (value ?? '').trim().toLowerCase()
  if (
    v === 'dd/mm/yyyy' ||
    v === 'mm/dd/yyyy' ||
    v === 'mm/dd/yy' ||
    v === 'dd/mm/yy' ||
    v === 'yyyy/mm/dd' ||
    v === 'yyyy/dd/mm'
  ) {
    return v
  }
  return 'dd/mm/yyyy'
}

function dateLabel(input: string, format: DateFormatOption): string {
  return formatDateByPattern(input, format)
}

export interface JobInvoicePrintSnapshot {
  /** Legacy optional label; store name still comes from settings unless missing */
  storeName?: string
  invoice_number: string
  created_at: string
  status: string
  customer_name: string
  vehicle_label: string
  job_number?: string | null
  items: Array<{ description: string; quantity: number; unit_price: number; total_price: number }>
  total_amount: number
  subtotal?: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  discount_type?: string | null
  discount_value?: number | null
  notes?: string | null
  payment_terms?: string | null
  /** Job car inspection JSON; shown only when include_inspection_on_invoice is truthy */
  inspection_data?: string | null
  /** Per job invoice: 1 = include diagram on print */
  include_inspection_on_invoice?: number | null
}

function sumLineTotals(
  items: JobInvoicePrintSnapshot['items'],
): number {
  return items.reduce((s, row) => s + (Number(row.total_price) || 0), 0)
}

function discountLabel(snapshot: JobInvoicePrintSnapshot, discountAmount: number): string {
  if (discountAmount <= 0) return 'Discount'
  const t = snapshot.discount_type
  const v = snapshot.discount_value
  if (t === 'percentage' && v != null && Number(v) > 0) {
    return `Discount (${Number(v)}%)`
  }
  if (t === 'fixed') return 'Discount'
  return 'Discount'
}

/**
 * A4 job invoice using the same store / invoice / receipt appearance settings as other printed documents.
 */
export async function printJobInvoiceDraft(snapshot: JobInvoicePrintSnapshot): Promise<void> {
  const settingsRes = await window.electronAPI.settings.getAll()
  const settings = (settingsRes.success && settingsRes.data ? settingsRes.data : {}) as Record<string, string>

  const storeName = settings['store.name']?.trim() || snapshot.storeName?.trim() || 'Mahali Garage'
  const storeNameArabic =
    settings['store.name_ar'] ||
    settings['store.name_arabic'] ||
    settings['store.arabic_name'] ||
    ''
  const storeAddress = settings['store.address'] || ''
  const storePhone = settings['store.phone'] || ''
  const storePhone2 = settings['store.phone2'] || settings['store.phone_2'] || ''
  const storeEmail = settings['store.email'] || ''
  const storeLogo = settings['store_logo'] || ''
  const currencySymbol = settings['store.currency_symbol'] || 'د.إ'
  const dateFormat = toDateFormat(settings['date.format'])

  const showLogoInvoice = (settings['invoice.show_logo'] ?? settings['receipt.show_logo'] ?? 'true') === 'true'
  const showTaxOnInvoice = (settings['invoice.show_tax'] ?? 'true') === 'true'
  const showVatReceipt = (settings['receipt.show_vat'] ?? 'true') === 'true'
  const showBrands = (settings['receipt.show_brands'] ?? 'true') === 'true'
  const showTerms = (settings['receipt.show_terms'] ?? 'true') === 'true'
  const showCustomerInfo = (settings['receipt.show_customer_info'] ?? 'true') === 'true'
  const showCarInfo = (settings['receipt.show_car_info'] ?? 'true') === 'true'
  const receiptHeaderNameEn = (settings['receipt.header_name_en'] || '').trim() || storeName
  const receiptHeaderNameAr =
    (settings['receipt.header_name_ar'] || '').trim() || storeNameArabic || storeName
  const headerTel = (settings['receipt.header_tel'] || '').trim() || storePhone
  const headerMobile = (settings['receipt.header_mobile'] || '').trim() || storePhone2
  const showHeaderTel = (settings['receipt.header_show_tel'] ?? 'true') === 'true'
  const showHeaderMobile = (settings['receipt.header_show_mobile'] ?? 'true') === 'true'

  const supportedBrandsRaw =
    settings['receipt.supported_brands'] || settings['invoice.supported_brands'] || ''
  const supportedBrands = supportedBrandsRaw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  const brandLogosRaw = settings['receipt.brand_logos'] ?? ''
  const brandLogos: string[] = (() => {
    try {
      if (!brandLogosRaw) return []
      const parsed = JSON.parse(brandLogosRaw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()
  const hasLogoImages = brandLogos.length > 0

  const brandsTitle = settings['receipt.brands_title']?.trim() || 'We Work with'

  const terms =
    settings['receipt.terms']?.trim() ||
    settings['invoice.terms']?.trim() ||
    settings['invoice.footer_text']?.trim() ||
    ''

  const lineSum = sumLineTotals(snapshot.items)
  const subtotal =
    snapshot.subtotal != null && Number.isFinite(Number(snapshot.subtotal))
      ? Number(snapshot.subtotal)
      : lineSum

  const taxAmt = Number(snapshot.tax_amount ?? 0)
  const total = Number(snapshot.total_amount ?? 0)
  const taxablePortion = total - taxAmt
  const discountAmount = Math.max(0, subtotal - taxablePortion)

  const showTaxRow = showTaxOnInvoice && showVatReceipt && taxAmt > 0

  const rows = snapshot.items
    .map(
      row => `<tr>
      <td>${escapeHtml(row.description)}</td>
      <td class="num">${row.quantity}</td>
      <td class="num">${currency(Number(row.unit_price), currencySymbol)}</td>
      <td class="num">${currency(Number(row.total_price), currencySymbol)}</td>
    </tr>`,
    )
    .join('')

  const notesBlock =
    snapshot.notes?.trim() ? `
    <div class="notesBlock">
      <div class="label">Notes</div>
      <div class="notes">${escapeHtml(snapshot.notes.trim())}</div>
    </div>` : ''

  const paymentTermsBlock =
    snapshot.payment_terms?.trim() ? `
    <div class="notesBlock">
      <div class="label">Payment terms</div>
      <div class="notes">${escapeHtml(snapshot.payment_terms.trim())}</div>
    </div>` : ''

  const showInsp =
    Number(snapshot.include_inspection_on_invoice ?? 0) === 1 &&
    Boolean(snapshot.inspection_data?.trim())

  const inspectionBlock = showInsp ? buildInspectionSection(snapshot.inspection_data, false) : ''

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.invoice_number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .invoice { width: 100%; }
    .header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; }
    .logo { width: 120px; height: 70px; object-fit: contain; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }
    .logoSlot { width: 120px; height: 70px; }
    .headCol { font-size: 12px; color: #374151; line-height: 1.5; }
    .headCol.left { text-align: left; }
    .headCol.right { text-align: right; }
    .name { font-size: 22px; font-weight: 700; margin: 0; line-height: 1.1; }
    .nameArabic { direction: rtl; unicode-bidi: plaintext; }
    .headPhone { font-size: 12px; margin-top: 3px; }
    .muted { color: #4b5563; font-size: 12px; margin-top: 3px; }
    .docType { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
    .divider { height: 1px; background: #e5e7eb; margin: 14px 0 16px; }
    .bill { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 14px; }
    .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
    .value { font-size: 13px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead th { text-align: left; font-size: 11px; color: #374151; background: #f3f4f6; padding: 8px; border: 1px solid #e5e7eb; }
    tbody td { font-size: 12px; padding: 8px; border: 1px solid #e5e7eb; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 14px; margin-left: auto; width: 320px; }
    .totals .r { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
    .totals .grand { font-size: 16px; font-weight: 700; border-top: 2px solid #111827; margin-top: 4px; padding-top: 8px; }
    .notesBlock { margin-top: 14px; }
    .notes { font-size: 12px; color: #374151; white-space: pre-wrap; line-height: 1.45; }
    .foot { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .footTitle { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
    .brands { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .brand { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #374151; }
    .terms { font-size: 11px; color: #4b5563; white-space: pre-wrap; line-height: 1.45; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <main class="invoice">
    <header class="header">
      <div class="headCol left">
        <h1 class="name">${escapeHtml(receiptHeaderNameEn)}</h1>
        ${showHeaderTel && headerTel ? `<div class="headPhone">Tel: ${escapeHtml(headerTel)}</div>` : ''}
        ${showHeaderMobile && headerMobile ? `<div class="headPhone">Mobile: ${escapeHtml(headerMobile)}</div>` : ''}
      </div>
      <div>
        ${showLogoInvoice && storeLogo ? `<img class="logo" src="${storeLogo}" alt="logo" />` : '<div class="logoSlot"></div>'}
      </div>
      <div class="headCol right">
        <h1 class="name nameArabic">${escapeHtml(receiptHeaderNameAr)}</h1>
        ${showHeaderTel && headerTel ? `<div class="headPhone">Tel: ${escapeHtml(headerTel)}</div>` : ''}
        ${showHeaderMobile && headerMobile ? `<div class="headPhone">Mobile: ${escapeHtml(headerMobile)}</div>` : ''}
      </div>
    </header>

    <div class="divider"></div>
    <div class="docType">Invoice</div>

    <section class="bill">
      <div>
        ${showCustomerInfo ? `
        <div class="label">Bill to</div>
        <div class="value"><strong>${escapeHtml(snapshot.customer_name || '—')}</strong></div>
        ` : ''}
      </div>
      <div>
        <div class="value"><strong>Date:</strong> ${escapeHtml(dateLabel(snapshot.created_at, dateFormat))}</div>
        <div class="value"><strong>Invoice #:</strong> ${escapeHtml(snapshot.invoice_number)}</div>
        <div class="value"><strong>Status:</strong> ${escapeHtml(snapshot.status)}</div>
        ${showCarInfo ? `
        <div class="value"><strong>Vehicle:</strong> ${escapeHtml(snapshot.vehicle_label || '—')}</div>
        ` : ''}
        ${snapshot.job_number ? `<div class="value"><strong>Job #:</strong> ${escapeHtml(snapshot.job_number)}</div>` : ''}
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="totals">
      <div class="r"><span>Subtotal</span><span>${currency(subtotal, currencySymbol)}</span></div>
      ${discountAmount > 0 ? `<div class="r" style="color:#dc2626;"><span>${escapeHtml(discountLabel(snapshot, discountAmount))}</span><span>− ${currency(discountAmount, currencySymbol)}</span></div>` : ''}
      ${showTaxRow ? `<div class="r"><span>VAT (${Number.isFinite(Number(snapshot.tax_rate)) ? Number(snapshot.tax_rate) : 0}%)</span><span>${currency(taxAmt, currencySymbol)}</span></div>` : ''}
      <div class="r grand"><span>Total amount due</span><span>${currency(total, currencySymbol)}</span></div>
    </section>

    ${paymentTermsBlock}
    ${notesBlock}
    ${inspectionBlock}

    <footer class="foot">
      ${showBrands && (hasLogoImages || supportedBrands.length > 0) ? `
        <div class="footTitle">${escapeHtml(brandsTitle)}:</div>
        ${hasLogoImages ? `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin:6px 16px;">
      ${brandLogos.map(logo => `<img src="${logo}" style="height:108px;width:auto;max-width:216px;object-fit:contain;" alt="" />`).join('')}
    </div>
        ` : `
        <div class="brands">
          ${supportedBrands.map(v => `<span class="brand">${escapeHtml(v)}</span>`).join('')}
        </div>
        `}
      ` : ''}
      ${showTerms && terms ? `
        <div class="footTitle">Our terms:</div>
        <div class="terms">${escapeHtml(terms)}</div>
      ` : ''}
    </footer>
  </main>
</body>
</html>`

  const res = await window.electronAPI.print.receipt(html)
  if (!res.success) {
    throw new Error(res.error || 'Failed to print invoice')
  }
}
