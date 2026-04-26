type Department = 'mechanical' | 'programming' | 'both'
import { type DateFormatOption, formatDateByPattern } from '../store/dateFormatStore'

interface ReceiptLine {
  service_name: string
  sell_price: number
}

interface CustomReceiptPrintable {
  receipt_number: string
  created_at: string
  department: Department
  customer_name: string
  customer_address: string | null
  customer_email: string | null
  customer_phone: string | null
  plate_number: string | null
  car_company: string | null
  car_model: string | null
  amount: number
  mechanical_services_json: string | null
  programming_services_json: string | null
  services_description?: string | null
  discount_type?: string | null
  discount_value?: number | null
  discount_amount?: number | null
  payment_method?: string | null
  cash_received?: number | null
  change_amount?: number | null
  loyalty_points?: number | null
  loyalty_stamps?: number | null
  loyalty_visits?: number | null
  loyalty_config?: {
    pointsLabel?: string
    stampsForReward?: number
    type?: string
    enabled?: boolean
    showOnReceipt?: boolean
  } | null
  inspection_data?: string | null
}

function escapeHtml(v: string): string {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseLines(raw: string | null): ReceiptLine[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as Array<{ service_name?: string; name?: string; sell_price?: number }>
    return arr
      .map(line => ({
        service_name: String(line.service_name ?? line.name ?? '').trim(),
        sell_price: Number(line.sell_price ?? 0),
      }))
      .filter(line => line.service_name !== '')
  } catch {
    return []
  }
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

/** Used by job invoice print when the per-invoice “include diagram” option is on. Pass `includeSignatures: false`. */
export function buildInspectionSection(
  inspectionData: string | null | undefined,
  includeSignatures: boolean,
): string {
  if (!inspectionData) return ''
  try {
    const inspection = JSON.parse(inspectionData) as {
      markers?: Array<{ x: number; y: number; type: string; note: string }>
      notes?: string
    }
    const markers = inspection.markers ?? []
    const notes = typeof inspection.notes === 'string' ? inspection.notes.trim() : ''
    if (!markers.length && !notes) return ''

    const markerColors: Record<string, string> = {
      scratch: '#ef4444',
      dent: '#f97316',
      broken: '#1e293b',
      other: '#eab308',
    }

    const markerSvg = markers
      .map((m, i) => {
        const cx = (m.x / 100) * 200
        const cy = (m.y / 100) * 350
        const color = markerColors[m.type] || '#64748b'
        return `
            <circle cx="${cx}" cy="${cy}"
              r="8" fill="${color}"
              stroke="white" stroke-width="1.5"/>
            <text x="${cx}" y="${cy + 4}"
              text-anchor="middle"
              font-size="8" fill="white"
              font-weight="bold">${i + 1}</text>
          `
      })
      .join('')

    const legendItems = markers
      .map(
        (m, i) => `
          <div style="display:flex;
            align-items:center;gap:6px;
            margin-bottom:3px;">
            <div style="width:16px;height:16px;
              border-radius:50%;
              background:${markerColors[m.type] || '#64748b'};
              display:flex;align-items:center;
              justify-content:center;
              color:white;font-size:9px;
              font-weight:bold;flex-shrink:0;">
              ${i + 1}
            </div>
            <span style="font-size:11px;
              text-transform:capitalize;">
              ${escapeHtml(m.type)}
              ${m.note ? ` — ${escapeHtml(m.note)}` : ''}
            </span>
          </div>
        `,
      )
      .join('')

    return `
        <div style="margin:16px 0;
          border-top:1px solid #e2e8f0;
          padding-top:12px;">
          <p style="font-size:12px;
            font-weight:600;
            margin-bottom:10px;
            color:#334155;
            text-align:center;">
            Car Condition at Arrival
          </p>
          <div style="display:flex;
            justify-content:center;
            width:100%;">
          <div style="display:flex;
            gap:16px;align-items:flex-start;">
            
            <div style="flex-shrink:0;">
              <svg viewBox="0 0 200 350"
                width="80" height="140"
                xmlns="http://www.w3.org/2000/svg">
                <rect x="40" y="60" width="120"
                  height="230" rx="20"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2.5"/>
                <rect x="55" y="75" width="90"
                  height="50" rx="8"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="55" y="225" width="90"
                  height="50" rx="8"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="50" y="30" width="100"
                  height="35" rx="10"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="50" y="285" width="100"
                  height="35" rx="10"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="15" y="55" width="25"
                  height="45" rx="5"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="160" y="55" width="25"
                  height="45" rx="5"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="15" y="250" width="25"
                  height="45" rx="5"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <rect x="160" y="250" width="25"
                  height="45" rx="5"
                  fill="none" stroke="#94a3b8"
                  stroke-width="2"/>
                <line x1="40" y1="175"
                  x2="160" y2="175"
                  stroke="#94a3b8"
                  stroke-width="1.5"
                  stroke-dasharray="4 2"/>
                ${markerSvg}
              </svg>
            </div>

            <div style="flex:0 1 auto;min-width:0;max-width:280px;">
              ${legendItems}
              ${notes ? `
                <p style="font-size:11px;
                  color:#64748b;margin-top:6px;
                  font-style:italic;">
                  Note: ${escapeHtml(notes)}
                </p>
              ` : ''}
            </div>
          </div>
          </div>

          ${includeSignatures
            ? `
          <div style="margin-top:12px;
            display:flex;gap:40px;">
            <div style="flex:1;
              border-top:1px solid #94a3b8;
              padding-top:6px;
              text-align:center;
              font-size:10px;color:#64748b;">
              Customer Signature
            </div>
            <div style="flex:1;
              border-top:1px solid #94a3b8;
              padding-top:6px;
              text-align:center;
              font-size:10px;color:#64748b;">
              Technician Signature
            </div>
          </div>
          `
            : ''}
        </div>
      `
  } catch {
    return ''
  }
}

const INVOICE_INCLUDE_SIG_KEY = 'invoiceIncludeSignatures'

export type PrintReceiptA4Options = {
  /** Overrides localStorage when set */
  includeSignatures?: boolean
}

function readIncludeSignaturesFromStorage(): boolean {
  try {
    return localStorage.getItem(INVOICE_INCLUDE_SIG_KEY) === 'true'
  } catch {
    return false
  }
}

export async function printCustomReceiptA4(
  receipt: CustomReceiptPrintable,
  options?: PrintReceiptA4Options,
): Promise<void> {
  const includeSignatures =
    options?.includeSignatures ?? readIncludeSignaturesFromStorage()
  const settingsRes = await window.electronAPI.settings.getAll()
  const settings = (settingsRes.success && settingsRes.data
    ? settingsRes.data
    : {}) as Record<string, string>

  const storeName = settings['store.name'] || 'Mahali Garage'
  const storeNameArabic =
    settings['store.name_ar'] ||
    settings['store.name_arabic'] ||
    settings['store.arabic_name'] ||
    ''
  const storeAddress = settings['store.address'] || ''
  const storePhone = settings['store.phone'] || ''
  const storePhone2 = settings['store.phone2'] || settings['store.phone_2'] || ''
  const receiptHeaderNameEn = (settings['receipt.header_name_en'] || '').trim() || storeName
  const receiptHeaderNameAr =
    (settings['receipt.header_name_ar'] || '').trim() || storeNameArabic || storeName
  const headerTel = (settings['receipt.header_tel'] || '').trim() || storePhone
  const headerMobile = (settings['receipt.header_mobile'] || '').trim() || storePhone2
  const showHeaderTel = (settings['receipt.header_show_tel'] ?? 'true') === 'true'
  const showHeaderMobile = (settings['receipt.header_show_mobile'] ?? 'true') === 'true'
  const headerTextColor = settings['receipt.header_text_color'] || '#111827'
  const storeEmail = settings['store.email'] || ''
  const storeLogo = settings['store_logo'] || ''
  const currencySymbol = settings['store.currency_symbol'] || 'د.إ'
  const dateFormat = toDateFormat(settings['date.format'])

  const taxEnabled = settings['tax.enabled'] === 'true'
  const taxRate = Number(settings['tax.rate'] || 0)

  // Receipt section toggles (default on)
  const showVat          = (settings['receipt.show_vat']           ?? 'true') === 'true'
  const showBrands       = (settings['receipt.show_brands']        ?? 'true') === 'true'
  const showTerms        = (settings['receipt.show_terms']         ?? 'true') === 'true'
  const showLogo         = (settings['receipt.show_logo']          ?? 'true') === 'true'
  const showCustomerInfo = (settings['receipt.show_customer_info'] ?? 'true') === 'true'
  const showCarInfo      = (settings['receipt.show_car_info']      ?? 'true') === 'true'

  const loyaltyRaw = settings['loyalty.config'] ?? ''
  const loyaltyCfg = (() => {
    try {
      return loyaltyRaw ? JSON.parse(loyaltyRaw) : null
    } catch {
      return null
    }
  })() as {
    pointsLabel?: string
    stampsForReward?: number
    type?: string
    enabled?: boolean
    showOnReceipt?: boolean
  } | null
  const showLoyaltyOnReceipt =
    loyaltyCfg?.enabled === true &&
    loyaltyCfg?.showOnReceipt !== false &&
    (receipt.loyalty_points != null ||
      receipt.loyalty_stamps != null)

  // Brands: prefer receipt.supported_brands, fall back to invoice.supported_brands
  const supportedBrandsRaw = settings['receipt.supported_brands']
    || settings['invoice.supported_brands'] || ''
  const supportedBrands = supportedBrandsRaw
    .split(',').map(v => v.trim()).filter(Boolean)

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

  const brandsTitle =
    settings['receipt.brands_title']?.trim()
    || 'We Work with'

  // Terms: prefer receipt.terms, fall back to invoice.terms / invoice.footer_text
  const terms = settings['receipt.terms']
    || settings['invoice.terms']
    || settings['invoice.footer_text'] || ''

  let mechanical = parseLines(receipt.mechanical_services_json)
  let programming = parseLines(receipt.programming_services_json)

  // Fallback for old-format receipts that only have services_description text
  if (mechanical.length === 0 && programming.length === 0 && receipt.services_description) {
    const fallbackLines: ReceiptLine[] = receipt.services_description
      .split('\n')
      .map(l => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .map(name => ({ service_name: name, sell_price: 0 }))
    mechanical = fallbackLines
  }

  const subtotal = Number(receipt.amount || 0)
  const discountAmount = receipt.discount_amount ?? 0
  const hasDiscount = discountAmount > 0
  const preDiscountSubtotal = subtotal + discountAmount
  const discountLabel =
    receipt.discount_type === 'percent'
      ? `Discount (${receipt.discount_value ?? 0}%)`
      : 'Discount'
  const vatAmount = taxEnabled ? (subtotal * (Number.isFinite(taxRate) ? taxRate : 0) / 100) : 0
  const totalDue = subtotal + vatAmount
  const isCashPayment = String(receipt.payment_method ?? '').toLowerCase() === 'cash'
  const paidCash = isCashPayment
    ? Number(receipt.cash_received ?? totalDue)
    : 0
  const changeCash = isCashPayment
    ? Math.max(
        0,
        Number(
          receipt.change_amount != null
            ? receipt.change_amount
            : paidCash - totalDue,
        ),
      )
    : 0

  const row = (line: ReceiptLine) => `
    <tr>
      <td>${escapeHtml(line.service_name)}</td>
      <td class="num">1</td>
      <td class="num">${currency(line.sell_price, currencySymbol)}</td>
      <td class="num">${currency(line.sell_price, currencySymbol)}</td>
    </tr>
  `

  const section = (title: string, lines: ReceiptLine[]) => `
    <section class="svc">
      <h3>${title}</h3>
      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th class="num">Quantity</th>
            <th class="num">Unit Price</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(row).join('')}
        </tbody>
      </table>
    </section>
  `

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(receipt.receipt_number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .invoice { width: 100%; }
    .header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 18px;
    }
    .logo { width: 120px; height: 70px; object-fit: contain; }
    .logoSlot { width: 120px; height: 70px; }
    .headCol { font-size: 12px; color: ${headerTextColor}; line-height: 1.5; text-align: center; display: flex; flex-direction: column; align-items: center; }
    .headCol.left { text-align: center; align-items: center; }
    .headCol.right { text-align: center; align-items: center; }
    .name { font-size: 22px; font-weight: 700; margin: 0; line-height: 1.1; color: ${headerTextColor}; }
    .nameArabic { direction: rtl; unicode-bidi: plaintext; }
    .headPhone { font-size: 12px; margin-top: 3px; color: ${headerTextColor}; }
    .divider { height: 1px; background: #111827; margin: 12px 0 16px; }
    .muted { color: #4b5563; font-size: 12px; margin-top: 3px; }
    .bill { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 14px; }
    .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
    .value { font-size: 13px; margin: 2px 0; }
    .svc { margin-top: 12px; }
    .svc h3 { margin: 0 0 8px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-size: 11px; color: #374151; background: #f3f4f6; padding: 8px; border: 1px solid #e5e7eb; }
    tbody td { font-size: 12px; padding: 8px; border: 1px solid #e5e7eb; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 14px; margin-left: auto; width: 320px; }
    .totals .r { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
    .totals .grand { font-size: 16px; font-weight: 700; border-top: 2px solid #111827; margin-top: 4px; padding-top: 8px; }
    .totals .cashPaid { border-top: 1px solid #d1d5db; margin-top: 6px; padding-top: 8px; }
    .totals .change { font-weight: 700; color: #047857; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 10px; margin-top: 6px; }
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
      <div class="headCol left" style="text-align:center;display:flex;flex-direction:column;align-items:center;">
        <h1 class="name" style="text-align:center;">${escapeHtml(receiptHeaderNameEn)}</h1>
        ${showHeaderTel && headerTel ? `<div class="headPhone" style="text-align:center;">Tel: ${escapeHtml(headerTel)}</div>` : ''}
        ${showHeaderMobile && headerMobile ? `<div class="headPhone" style="text-align:center;">Mobile: ${escapeHtml(headerMobile)}</div>` : ''}
      </div>
      <div>
        ${showLogo && storeLogo ? `<img class="logo" src="${storeLogo}" alt="logo" />` : '<div class="logoSlot"></div>'}
      </div>
      <div class="headCol right" style="text-align:center;display:flex;flex-direction:column;align-items:center;">
        <h1 class="name nameArabic" style="text-align:center;">${escapeHtml(receiptHeaderNameAr)}</h1>
        ${showHeaderTel && headerTel ? `<div class="headPhone" style="text-align:center;">Tel: ${escapeHtml(headerTel)}</div>` : ''}
        ${showHeaderMobile && headerMobile ? `<div class="headPhone" style="text-align:center;">Mobile: ${escapeHtml(headerMobile)}</div>` : ''}
      </div>
    </header>

    <div class="divider"></div>

    <section class="bill">
      <div>
        ${showCustomerInfo ? `
        <div class="label">Bill to</div>
        <div class="value"><strong>${escapeHtml(receipt.customer_name || 'Walk-in Customer')}</strong></div>
        ${receipt.customer_address ? `<div class="value">${escapeHtml(receipt.customer_address)}</div>` : ''}
        ${receipt.customer_email ? `<div class="value">${escapeHtml(receipt.customer_email)}</div>` : ''}
        ${receipt.customer_phone ? `<div class="value">${escapeHtml(receipt.customer_phone)}</div>` : ''}
        ` : ''}
      </div>
      <div>
        <div class="value"><strong>Date:</strong> ${escapeHtml(dateLabel(receipt.created_at, dateFormat))}</div>
        <div class="value"><strong>Invoice #:</strong> ${escapeHtml(receipt.receipt_number)}</div>
        ${showCarInfo ? `
        <div class="value"><strong>Car:</strong> ${escapeHtml([receipt.car_company, receipt.car_model].filter(Boolean).join(' ') || 'Walk-in')}</div>
        ${receipt.plate_number ? `<div class="value"><strong>Plate:</strong> ${escapeHtml(receipt.plate_number)}</div>` : ''}
        ` : ''}
      </div>
    </section>

    ${buildInspectionSection(receipt.inspection_data, includeSignatures)}

    ${(receipt.department !== 'programming') && mechanical.length > 0
      ? section('Mechanical Services', mechanical)
      : ''}
    ${(receipt.department !== 'mechanical') && programming.length > 0
      ? section('Programming Services', programming)
      : ''}

    <section class="totals">
      <div class="r"><span>Subtotal</span><span>${currency(hasDiscount ? preDiscountSubtotal : subtotal, currencySymbol)}</span></div>
      ${hasDiscount ? `<div class="r" style="color:#dc2626;"><span>${discountLabel}</span><span>- ${currency(discountAmount, currencySymbol)}</span></div>` : ''}
      ${taxEnabled && showVat ? `<div class="r"><span>VAT (${Number.isFinite(taxRate) ? taxRate : 0}%)</span><span>${currency(vatAmount, currencySymbol)}</span></div>` : ''}
      <div class="r grand"><span>Total Amount Due</span><span>${currency(totalDue, currencySymbol)}</span></div>
      ${isCashPayment ? `<div class="r cashPaid"><span>PAID (CASH)</span><span>${currency(paidCash, currencySymbol)}</span></div>` : ''}
      ${isCashPayment && changeCash > 0 ? `<div class="r change"><span>CHANGE</span><span>${currency(changeCash, currencySymbol)}</span></div>` : ''}
    </section>

    ${showLoyaltyOnReceipt ? `
    <div style="border-top:1px solid #e2e8f0;
      margin-top:8px;padding-top:8px;">
      <p style="font-size:10px;font-weight:700;
        color:#334155;margin:0 0 4px;">
        ${escapeHtml(
          loyaltyCfg?.pointsLabel || 'Loyalty'
        )}
      </p>
      ${receipt.loyalty_points != null ? `
        <div style="display:flex;
          justify-content:space-between;
          font-size:10px;">
          <span>${escapeHtml(
            loyaltyCfg?.pointsLabel || 'Points'
          )}</span>
          <span style="font-weight:700;">
            ${receipt.loyalty_points}
          </span>
        </div>` : ''}
      ${receipt.loyalty_stamps != null ? `
        <div style="display:flex;
          justify-content:space-between;
          font-size:10px;">
          <span>Stamps</span>
          <span style="font-weight:700;">
            ${receipt.loyalty_stamps} /
            ${loyaltyCfg?.stampsForReward || 10}
          </span>
        </div>` : ''}
      ${receipt.loyalty_visits != null ? `
        <div style="display:flex;
          justify-content:space-between;
          font-size:10px;">
          <span>Total Visits</span>
          <span style="font-weight:700;">
            ${receipt.loyalty_visits}
          </span>
        </div>` : ''}
    </div>
  ` : ''}

    <footer class="foot">
      ${showBrands && (hasLogoImages || supportedBrands.length > 0) ? `
        <div class="footTitle">${escapeHtml(brandsTitle)}:</div>
        ${hasLogoImages ? `
    <div style="display:flex;flex-wrap:wrap;
      gap:12px;align-items:center;
      justify-content:center;
      margin:6px 16px;">
      ${brandLogos.map(logo =>
        `<img src="${logo}" 
          style="height:108px;width:auto;
          max-width:216px;object-fit:contain;" 
          alt="" />`
      ).join('')}
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
    throw new Error(res.error || 'Failed to print receipt')
  }
}

