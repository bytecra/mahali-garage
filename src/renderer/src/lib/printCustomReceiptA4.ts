type Department = 'mechanical' | 'programming' | 'both'

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

function dateLabel(input: string): string {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function printCustomReceiptA4(receipt: CustomReceiptPrintable): Promise<void> {
  const settingsRes = await window.electronAPI.settings.getAll()
  const settings = (settingsRes.success && settingsRes.data
    ? settingsRes.data
    : {}) as Record<string, string>

  const storeName = settings['store.name'] || 'Mahali Garage'
  const storeAddress = settings['store.address'] || ''
  const storePhone = settings['store.phone'] || ''
  const storeEmail = settings['store.email'] || ''
  const storeLogo = settings['store_logo'] || ''
  const currencySymbol = settings['store.currency_symbol'] || 'د.إ'

  const taxEnabled = settings['tax.enabled'] === 'true'
  const taxRate = Number(settings['tax.rate'] || 0)

  // Receipt section toggles (default on)
  const showVat          = (settings['receipt.show_vat']           ?? 'true') === 'true'
  const showBrands       = (settings['receipt.show_brands']        ?? 'true') === 'true'
  const showTerms        = (settings['receipt.show_terms']         ?? 'true') === 'true'
  const showLogo         = (settings['receipt.show_logo']          ?? 'true') === 'true'
  const showCustomerInfo = (settings['receipt.show_customer_info'] ?? 'true') === 'true'
  const showCarInfo      = (settings['receipt.show_car_info']      ?? 'true') === 'true'

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
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .leftHead { display: flex; align-items: flex-start; gap: 12px; }
    .logo { width: 72px; height: 72px; object-fit: contain; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }
    .name { font-size: 22px; font-weight: 700; margin: 0; }
    .muted { color: #4b5563; font-size: 12px; margin-top: 3px; }
    .rightHead { text-align: right; font-size: 12px; color: #374151; line-height: 1.5; }
    .divider { height: 1px; background: #e5e7eb; margin: 14px 0 16px; }
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
      <div class="leftHead">
        ${showLogo && storeLogo ? `<img class="logo" src="${storeLogo}" alt="logo" />` : ''}
        <div>
          <h1 class="name">${escapeHtml(storeName)}</h1>
          ${storeAddress ? `<div class="muted">${escapeHtml(storeAddress)}</div>` : ''}
        </div>
      </div>
      <div class="rightHead">
        ${storePhone ? `<div>${escapeHtml(storePhone)}</div>` : ''}
        ${storeEmail ? `<div>${escapeHtml(storeEmail)}</div>` : ''}
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
        <div class="value"><strong>Date:</strong> ${escapeHtml(dateLabel(receipt.created_at))}</div>
        <div class="value"><strong>Invoice #:</strong> ${escapeHtml(receipt.receipt_number)}</div>
        ${showCarInfo ? `
        <div class="value"><strong>Car:</strong> ${escapeHtml([receipt.car_company, receipt.car_model].filter(Boolean).join(' ') || 'Walk-in')}</div>
        ${receipt.plate_number ? `<div class="value"><strong>Plate:</strong> ${escapeHtml(receipt.plate_number)}</div>` : ''}
        ` : ''}
      </div>
    </section>

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
    </section>

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

