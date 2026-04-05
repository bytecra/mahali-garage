type ReportDepartment = 'Mechanical' | 'Programming' | 'Both'

type DailySalesRow = {
  invoice: string
  customer: string
  car: string
  amount: number
  status: string
}

type TopServiceRow = {
  rank: number
  serviceName: string
  count: number
  revenue: number
}

type CarsDeliveredRow = {
  date: string
  car: string
  services: string
  department: string
  amount: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function fmtAmount(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`
}

function nowLabel(): string {
  return new Date().toLocaleString()
}

function baseStyles(): string {
  return `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      background: #ffffff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .page {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .store-name {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      color: #2563eb;
      letter-spacing: 0.2px;
    }
    .subtitle {
      margin: 2px 0 0;
      font-size: 14px;
      color: #334155;
      font-weight: 600;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin: 10px 0 14px;
      font-size: 11px;
      color: #475569;
      flex-wrap: wrap;
    }
    .meta-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 10px;
    }
    .meta strong {
      color: #0f172a;
    }
    .summary-grid {
      display: grid;
      gap: 10px;
      margin: 0 0 14px;
    }
    .summary-3 { grid-template-columns: repeat(3, 1fr); }
    .summary-4 { grid-template-columns: repeat(4, 1fr); }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .summary-label {
      margin: 0 0 4px;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .summary-value {
      margin: 0;
      font-size: 18px;
      color: #0f172a;
      font-weight: 800;
    }
    .table-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #eff6ff;
      color: #1e3a8a;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      font-weight: 700;
    }
    tbody tr:nth-child(odd) { background: #f8fafc; }
    tbody tr:nth-child(even) { background: #ffffff; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 10px;
      text-align: right;
    }
  `
}

function layoutHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${baseStyles()}</style>
  </head>
  <body>
    <div class="page">
      ${body}
    </div>
  </body>
</html>`
}

export function buildDailySalesPdf(params: {
  storeName: string
  dateFrom: string
  dateTo: string
  department: ReportDepartment
  rows: DailySalesRow[]
  currency: string
}): string {
  const { storeName, dateFrom, dateTo, department, rows, currency } = params
  const totalRevenue = rows.reduce((sum, row) => sum + row.amount, 0)
  const totalTransactions = rows.length
  const averageSale = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
  const generatedAt = nowLabel()

  const tableRows = rows
    .map((row) => {
      const statusLower = row.status.toLowerCase()
      const statusColor = statusLower === 'completed' ? '#16a34a' : '#64748b'
      return `<tr>
        <td>${escapeHtml(row.invoice)}</td>
        <td>${escapeHtml(row.customer)}</td>
        <td>${escapeHtml(row.car)}</td>
        <td class="amount">${escapeHtml(fmtAmount(row.amount, currency))}</td>
        <td><span style="color:${statusColor};font-weight:700;">${escapeHtml(row.status)}</span></td>
      </tr>`
    })
    .join('')

  return layoutHtml(
    'Daily Sales Report',
    `
      <header class="header">
        <h1 class="store-name">${escapeHtml(storeName)}</h1>
        <p class="subtitle">Daily Sales Report</p>
      </header>

      <section class="meta">
        <div class="meta-item"><strong>Date Range:</strong> ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)}</div>
        <div class="meta-item"><strong>Department:</strong> ${escapeHtml(department)}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${escapeHtml(generatedAt)}</div>
      </section>

      <section class="summary-grid summary-3">
        <div class="summary-box">
          <p class="summary-label">Total Revenue</p>
          <p class="summary-value">${escapeHtml(fmtAmount(totalRevenue, currency))}</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Total Transactions</p>
          <p class="summary-value">${totalTransactions}</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Average Sale</p>
          <p class="summary-value">${escapeHtml(fmtAmount(averageSale, currency))}</p>
        </div>
      </section>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:18%;">Invoice</th>
              <th style="width:24%;">Customer</th>
              <th style="width:28%;">Car</th>
              <th style="width:18%;" class="amount">Amount</th>
              <th style="width:12%;">Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>

      <footer class="footer">
        Generated by Mahali Garage — ${escapeHtml(generatedAt)}
      </footer>
    `,
  )
}

export function buildProfitPdf(params: {
  storeName: string
  dateFrom: string
  dateTo: string
  department: ReportDepartment
  totalRevenue: number
  totalCost: number
  grossProfit: number
  marginPercent: number
  currency: string
}): string {
  const {
    storeName,
    dateFrom,
    dateTo,
    department,
    totalRevenue,
    totalCost,
    grossProfit,
    marginPercent,
    currency,
  } = params
  const generatedAt = nowLabel()
  const profitColor = grossProfit >= 0 ? '#16a34a' : '#dc2626'
  const revenueSafe = Math.max(totalRevenue, 0)
  const costSafe = Math.max(totalCost, 0)
  const total = revenueSafe + costSafe
  const revenuePct = total > 0 ? (revenueSafe / total) * 100 : 0
  const costPct = total > 0 ? (costSafe / total) * 100 : 0

  return layoutHtml(
    'Profit Report',
    `
      <header class="header">
        <h1 class="store-name">${escapeHtml(storeName)}</h1>
        <p class="subtitle">Profit Report</p>
      </header>

      <section class="meta">
        <div class="meta-item"><strong>Date Range:</strong> ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)}</div>
        <div class="meta-item"><strong>Department:</strong> ${escapeHtml(department)}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${escapeHtml(generatedAt)}</div>
      </section>

      <section class="summary-grid summary-4">
        <div class="summary-box">
          <p class="summary-label">Revenue</p>
          <p class="summary-value">${escapeHtml(fmtAmount(totalRevenue, currency))}</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Cost</p>
          <p class="summary-value">${escapeHtml(fmtAmount(totalCost, currency))}</p>
        </div>
        <div class="summary-box" style="border-color:${profitColor};">
          <p class="summary-label">Gross Profit</p>
          <p class="summary-value" style="color:${profitColor};">${escapeHtml(fmtAmount(grossProfit, currency))}</p>
        </div>
        <div class="summary-box">
          <p class="summary-label">Margin %</p>
          <p class="summary-value">${marginPercent.toFixed(2)}%</p>
        </div>
      </section>

      <section style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc;">
        <p style="margin:0 0 8px;font-size:11px;color:#64748b;font-weight:700;">Revenue vs Cost</p>
        <div style="height:22px;border:1px solid #cbd5e1;border-radius:999px;overflow:hidden;background:#fff;display:flex;">
          <div style="width:${revenuePct.toFixed(2)}%;background:#2563eb;"></div>
          <div style="width:${costPct.toFixed(2)}%;background:#94a3b8;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#475569;">
          <span><strong style="color:#2563eb;">Revenue:</strong> ${escapeHtml(fmtAmount(totalRevenue, currency))}</span>
          <span><strong style="color:#64748b;">Cost:</strong> ${escapeHtml(fmtAmount(totalCost, currency))}</span>
        </div>
      </section>

      <footer class="footer">
        Generated by Mahali Garage — ${escapeHtml(generatedAt)}
      </footer>
    `,
  )
}

export function buildTopServicesPdf(params: {
  storeName: string
  dateFrom: string
  dateTo: string
  department: ReportDepartment
  rows: TopServiceRow[]
  currency: string
}): string {
  const { storeName, dateFrom, dateTo, department, rows, currency } = params
  const generatedAt = nowLabel()

  const tableRows = rows
    .map((row) => {
      let rankBorder = '#e2e8f0'
      if (row.rank === 1) rankBorder = '#d4af37'
      else if (row.rank === 2) rankBorder = '#c0c0c0'
      else if (row.rank === 3) rankBorder = '#cd7f32'

      return `<tr>
        <td style="border-left:4px solid ${rankBorder};font-weight:700;">${row.rank}</td>
        <td>${escapeHtml(row.serviceName)}</td>
        <td>${row.count}</td>
        <td class="amount">${escapeHtml(fmtAmount(row.revenue, currency))}</td>
      </tr>`
    })
    .join('')

  return layoutHtml(
    'Top Services Report',
    `
      <header class="header">
        <h1 class="store-name">${escapeHtml(storeName)}</h1>
        <p class="subtitle">Top Services Report</p>
      </header>

      <section class="meta">
        <div class="meta-item"><strong>Date Range:</strong> ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)}</div>
        <div class="meta-item"><strong>Department:</strong> ${escapeHtml(department)}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${escapeHtml(generatedAt)}</div>
      </section>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:10%;">#</th>
              <th style="width:52%;">Service</th>
              <th style="width:16%;">Jobs</th>
              <th style="width:22%;" class="amount">Revenue</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>

      <footer class="footer">
        Generated by Mahali Garage — ${escapeHtml(generatedAt)}
      </footer>
    `,
  )
}

export function buildCarsDeliveredPdf(params: {
  storeName: string
  dateFrom: string
  dateTo: string
  department: ReportDepartment
  totalCars: number
  rows: CarsDeliveredRow[]
  currency: string
}): string {
  const { storeName, dateFrom, dateTo, department, totalCars, rows, currency } = params
  const generatedAt = nowLabel()

  const tableRows = rows
    .map((row) => `<tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.car)}</td>
      <td>${escapeHtml(row.services)}</td>
      <td>${escapeHtml(row.department)}</td>
      <td class="amount">${escapeHtml(fmtAmount(row.amount, currency))}</td>
    </tr>`)
    .join('')

  return layoutHtml(
    'Cars Delivered Report',
    `
      <header class="header">
        <h1 class="store-name">${escapeHtml(storeName)}</h1>
        <p class="subtitle">Cars Delivered Report</p>
      </header>

      <section class="meta">
        <div class="meta-item"><strong>Date Range:</strong> ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)}</div>
        <div class="meta-item"><strong>Department:</strong> ${escapeHtml(department)}</div>
        <div class="meta-item"><strong>Generated At:</strong> ${escapeHtml(generatedAt)}</div>
      </section>

      <section class="summary-box" style="margin-bottom:14px;">
        <p class="summary-label">Total Cars Delivered</p>
        <p class="summary-value" style="font-size:30px;color:#2563eb;">${totalCars}</p>
      </section>

      <section class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:14%;">Date</th>
              <th style="width:22%;">Car</th>
              <th style="width:34%;">Services</th>
              <th style="width:14%;">Department</th>
              <th style="width:16%;" class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>

      <footer class="footer">
        Generated by Mahali Garage — ${escapeHtml(generatedAt)}
      </footer>
    `,
  )
}

export function buildAttendancePdf(params: {
  employeeId: number
  employeeName: string
  employeeIdNumber: string
  department: string
  fromDate: string
  toDate: string
  storeName: string
  records: Array<{
    date: string
    status_name: string
    status_color: string
    status_emoji: string
    notes: string | null
    marked_by_name: string | null
    marked_at: string
  }>
  summary: {
    total_days: number
    by_status: Array<{
      status_name: string
      status_emoji: string
      count: number
    }>
    attendance_rate: number
    present_days: number
  }
}): string {
  const { employeeName, employeeIdNumber, department, fromDate, toDate, storeName, records, summary } = params

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const formatTime = (dt: string) =>
    new Date(dt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

  const getDayName = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      weekday: 'long',
    })

  const summaryRows = summary.by_status
    .map(
      s => `
      <tr>
        <td style="padding:6px 12px;">
          ${escapeHtml(s.status_emoji)} ${escapeHtml(s.status_name)}
        </td>
        <td style="padding:6px 12px;
          text-align:center;font-weight:600;">
          ${s.count}
        </td>
      </tr>
    `
    )
    .join('')

  const attendanceRows = records
    .map(
      r => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 12px;
        font-size:12px;">
        ${escapeHtml(formatDate(r.date))}
      </td>
      <td style="padding:8px 12px;
        font-size:12px;color:#64748b;">
        ${escapeHtml(getDayName(r.date))}
      </td>
      <td style="padding:8px 12px;">
        <span style="display:inline-flex;
          align-items:center;gap:4px;
          padding:2px 8px;border-radius:9999px;
          font-size:11px;font-weight:500;
          background:${escapeHtml(r.status_color)}20;
          color:${escapeHtml(r.status_color)};">
          ${escapeHtml(r.status_emoji)} ${escapeHtml(r.status_name)}
        </span>
      </td>
      <td style="padding:8px 12px;
        font-size:11px;color:#64748b;">
        ${r.notes != null && r.notes !== '' ? escapeHtml(r.notes) : '—'}
      </td>
      <td style="padding:8px 12px;
        font-size:11px;color:#64748b;">
        ${r.marked_by_name ? escapeHtml(r.marked_by_name) : '—'}
        ${
          r.marked_at
            ? `<br><span style="font-size:10px;">
              ${escapeHtml(formatTime(r.marked_at))}
            </span>`
            : ''
        }
      </td>
    </tr>
  `
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 20mm; }
    * { box-sizing: border-box; margin: 0; 
        padding: 0; }
    body { font-family: 'Segoe UI', Arial, 
      sans-serif; color: #1e293b; 
      font-size: 13px; }
    h1 { font-size: 22px; font-weight: 700; }
    h2 { font-size: 15px; font-weight: 600;
         margin-bottom: 8px; color: #334155; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 8px 12px;
         text-align: left; font-size: 11px;
         font-weight: 600; color: #475569;
         text-transform: uppercase;
         letter-spacing: 0.05em; }
    .divider { border-top: 1px solid #e2e8f0;
               margin: 16px 0; }
    .badge { display: inline-block;
             padding: 2px 10px;
             border-radius: 9999px;
             font-size: 12px;
             font-weight: 500; }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex;justify-content:
    space-between;align-items:flex-start;
    margin-bottom:20px;">
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <p style="color:#64748b;font-size:13px;
        margin-top:2px;">
        Attendance Report
      </p>
    </div>
    <div style="text-align:right;
      font-size:12px;color:#64748b;">
      <p>Period: ${escapeHtml(formatDate(fromDate))} — 
        ${escapeHtml(formatDate(toDate))}</p>
      <p>Generated: ${escapeHtml(formatDate(new Date().toISOString()))}</p>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Employee Info -->
  <div style="display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px;margin-bottom:20px;">
    <div>
      <p style="font-size:11px;color:#64748b;">
        EMPLOYEE
      </p>
      <p style="font-weight:600;font-size:15px;">
        ${escapeHtml(employeeName)}
      </p>
      <p style="font-size:12px;color:#64748b;
        font-family:monospace;">
        ${escapeHtml(employeeIdNumber)}
      </p>
    </div>
    <div>
      <p style="font-size:11px;color:#64748b;">
        DEPARTMENT
      </p>
      <p style="font-weight:500;
        text-transform:capitalize;">
        ${department ? escapeHtml(department) : '—'}
      </p>
    </div>
  </div>

  <!-- Summary -->
  <div style="margin-bottom:20px;">
    <h2>Summary</h2>
    <div style="display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:12px;margin-bottom:12px;">
      <div style="background:#f8fafc;
        border:1px solid #e2e8f0;
        border-radius:8px;padding:12px;
        text-align:center;">
        <p style="font-size:11px;color:#64748b;">
          Attendance Rate
        </p>
        <p style="font-size:24px;font-weight:700;
          color:#2563eb;">
          ${Math.round(summary.attendance_rate * 100)}%
        </p>
      </div>
      <div style="background:#f8fafc;
        border:1px solid #e2e8f0;
        border-radius:8px;padding:12px;
        text-align:center;">
        <p style="font-size:11px;color:#64748b;">
          Present Days
        </p>
        <p style="font-size:24px;font-weight:700;">
          ${summary.present_days}
          <span style="font-size:14px;
            color:#64748b;">
            /${summary.total_days}
          </span>
        </p>
      </div>
      <div style="background:#f8fafc;
        border:1px solid #e2e8f0;
        border-radius:8px;padding:12px;
        text-align:center;">
        <p style="font-size:11px;color:#64748b;">
          Total Days
        </p>
        <p style="font-size:24px;font-weight:700;">
          ${summary.total_days}
        </p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th style="text-align:center;">Days</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

  <div class="divider"></div>

  <!-- Attendance Records -->
  <div>
    <h2>Daily Records</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Day</th>
          <th>Status</th>
          <th>Notes</th>
          <th>Marked By</th>
        </tr>
      </thead>
      <tbody>${attendanceRows}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="divider" 
    style="margin-top:30px;"></div>
  <div style="display:flex;
    justify-content:space-between;
    margin-top:20px;">
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #94a3b8;
        padding-top:8px;font-size:11px;
        color:#64748b;">
        Employee Signature
      </div>
    </div>
    <div style="text-align:center;width:40%;">
      <div style="border-top:1px solid #94a3b8;
        padding-top:8px;font-size:11px;
        color:#64748b;">
        Manager Signature
      </div>
    </div>
  </div>

</body>
</html>`
}

export function buildEmployeePayslipPdf(params: {
  employee: {
    employee_id: string
    full_name: string
    department: string
    role: string
    phone: string | null
  }
  payment: {
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
  }
  storeName: string
  currencySymbol: string
}): string {
  const { employee, payment, storeName, currencySymbol } = params
  const fmt = (n: number) => `${escapeHtml(currencySymbol)} ${n.toFixed(2)}`
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—'

  const net = payment.amount + payment.overtime_amount + payment.bonus_amount - payment.absence_deduction

  const otRow =
    payment.overtime_amount > 0
      ? `
      <tr>
        <td>
          Overtime 
          (${payment.overtime_hours}h × 
          ${payment.overtime_rate}x)
        </td>
        <td class="amount" 
          style="color:#16a34a;">
          + ${fmt(payment.overtime_amount)}
        </td>
      </tr>`
      : ''

  const bonusRow =
    payment.bonus_amount > 0
      ? `
      <tr>
        <td>
          Bonus
          ${payment.bonus_type ? `(${escapeHtml(payment.bonus_type)})` : ''}
          ${
            payment.bonus_note
              ? `<br><span style="font-size:11px;
                color:#64748b;">
                ${escapeHtml(payment.bonus_note)}</span>`
              : ''
          }
        </td>
        <td class="amount"
          style="color:#16a34a;">
          + ${fmt(payment.bonus_amount)}
        </td>
      </tr>`
      : ''

  const dedRow =
    payment.absence_deduction > 0
      ? `
      <tr>
        <td>
          Absence Deduction
          (${payment.absence_days} day
          ${payment.absence_days > 1 ? 's' : ''})
        </td>
        <td class="amount"
          style="color:#dc2626;">
          - ${fmt(payment.absence_deduction)}
        </td>
      </tr>`
      : ''

  const notesRow = payment.notes
    ? `
      <tr>
        <td colspan="2" 
          style="font-size:11px;
          color:#64748b;">
          Note: ${escapeHtml(payment.notes)}
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 20mm; }
    * { box-sizing:border-box;
        margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,
      sans-serif; color:#1e293b;
      font-size:13px; }
    .header { display:flex;
      justify-content:space-between;
      align-items:flex-start;
      margin-bottom:24px; }
    h1 { font-size:22px; font-weight:700; }
    h2 { font-size:14px; font-weight:600;
      color:#334155; margin-bottom:8px; }
    .divider { border-top:1px solid #e2e8f0;
      margin:16px 0; }
    table { width:100%;
      border-collapse:collapse; }
    th { background:#f1f5f9; padding:8px 12px;
      text-align:left; font-size:11px;
      font-weight:600; color:#475569;
      text-transform:uppercase; }
    td { padding:8px 12px; font-size:13px;
      border-bottom:1px solid #f1f5f9; }
    .amount { text-align:right; 
      font-weight:500; }
    .total-row td { font-weight:700;
      font-size:15px; background:#f8fafc; }
    .net-row td { font-weight:800;
      font-size:17px; color:#2563eb;
      background:#eff6ff; }
    .badge { display:inline-block;
      padding:2px 10px; border-radius:9999px;
      font-size:11px; font-weight:500; }
    .paid { background:#dcfce7; color:#166534; }
    .unpaid { background:#fef9c3; 
      color:#854d0e; }
    .sign-box { border-top:1px solid #94a3b8;
      padding-top:8px; text-align:center;
      font-size:11px; color:#64748b;
      width:40%; }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <p style="color:#64748b;font-size:13px;">
        Payslip
      </p>
    </div>
    <div style="text-align:right;
      font-size:12px;color:#64748b;">
      <p>Period: ${escapeHtml(fmtDate(payment.period_start))}
        — ${escapeHtml(fmtDate(payment.period_end))}</p>
      <p>Generated: ${escapeHtml(fmtDate(new Date().toISOString()))}</p>
    </div>
  </div>

  <div class="divider"></div>

  <div style="display:grid;
    grid-template-columns:1fr 1fr;
    gap:16px;margin-bottom:20px;">
    <div>
      <p style="font-size:11px;color:#64748b;">
        EMPLOYEE</p>
      <p style="font-weight:600;font-size:16px;">
        ${escapeHtml(employee.full_name)}</p>
      <p style="font-size:12px;color:#64748b;
        font-family:monospace;">
        ${escapeHtml(employee.employee_id)}</p>
      <p style="font-size:12px;color:#64748b;
        text-transform:capitalize;">
        ${escapeHtml(employee.department || '')} · 
        ${escapeHtml(employee.role || '')}</p>
      ${
        employee.phone
          ? `<p style="font-size:12px;
            color:#64748b;">
            📞 ${escapeHtml(employee.phone)}</p>`
          : ''
      }
    </div>
    <div>
      <p style="font-size:11px;color:#64748b;">
        PAYMENT STATUS</p>
      <span class="badge ${
        payment.status === 'paid' ? 'paid' : 'unpaid'}">
        ${escapeHtml(payment.status.toUpperCase())}
      </span>
      ${
        payment.paid_date
          ? `<p style="font-size:12px;
            color:#64748b;margin-top:4px;">
            Paid: ${escapeHtml(fmtDate(payment.paid_date))}
            </p>`
          : ''
      }
    </div>
  </div>

  <div class="divider"></div>

  <h2>Earnings & Deductions</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Base Salary</td>
        <td class="amount">
          ${fmt(payment.amount)}</td>
      </tr>
      ${otRow}
      ${bonusRow}
      ${dedRow}
      ${notesRow}
    </tbody>
    <tfoot>
      <tr class="net-row">
        <td>NET SALARY</td>
        <td class="amount">${fmt(net)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="divider" 
    style="margin-top:40px;"></div>
  <div style="display:flex;
    justify-content:space-between;
    margin-top:20px;">
    <div class="sign-box">
      Employee Signature
    </div>
    <div class="sign-box">
      Manager Signature
    </div>
  </div>

</body>
</html>`
}

export function buildSalarySummaryPdf(params: {
  employees: Array<{
    employee_id: string
    full_name: string
    department: string
    base_salary: number
    overtime_total: number
    bonus_total: number
    deduction_total: number
    net_total: number
    payments_count: number
  }>
  fromDate: string
  toDate: string
  department: string
  storeName: string
  currencySymbol: string
}): string {
  const { employees, fromDate, toDate, department, storeName, currencySymbol } = params

  const fmt = (n: number) => `${escapeHtml(currencySymbol)} ${n.toFixed(2)}`
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const grandTotal = employees.reduce(
    (acc, e) => {
      acc.base += e.base_salary
      acc.overtime += e.overtime_total
      acc.bonus += e.bonus_total
      acc.deductions += e.deduction_total
      acc.net += e.net_total
      return acc
    },
    {
      base: 0,
      overtime: 0,
      bonus: 0,
      deductions: 0,
      net: 0,
    }
  )

  const rows = employees
    .map(
      (e) => `
    <tr>
      <td>
        <p style="font-weight:500;">
          ${escapeHtml(e.full_name)}</p>
        <p style="font-size:11px;
          color:#64748b;font-family:monospace;">
          ${escapeHtml(e.employee_id)}</p>
      </td>
      <td style="text-align:center;
        text-transform:capitalize;
        color:#64748b;font-size:12px;">
        ${e.department ? escapeHtml(e.department) : '—'}
      </td>
      <td style="text-align:right;">
        ${fmt(e.base_salary)}</td>
      <td style="text-align:right;
        color:#16a34a;">
        ${e.overtime_total > 0 ? `+ ${fmt(e.overtime_total)}` : '—'}
      </td>
      <td style="text-align:right;
        color:#16a34a;">
        ${e.bonus_total > 0 ? `+ ${fmt(e.bonus_total)}` : '—'}
      </td>
      <td style="text-align:right;
        color:#dc2626;">
        ${e.deduction_total > 0 ? `- ${fmt(e.deduction_total)}` : '—'}
      </td>
      <td style="text-align:right;
        font-weight:700;color:#2563eb;">
        ${fmt(e.net_total)}
      </td>
    </tr>
  `
    )
    .join('')

  const deptLine =
    department && department !== 'all'
      ? `<p style="font-size:11px;color:#64748b;">Department: ${escapeHtml(department)}</p>`
      : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 landscape; margin:15mm; }
    * { box-sizing:border-box;
        margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,
      sans-serif; color:#1e293b;
      font-size:12px; }
    h1 { font-size:20px; font-weight:700; }
    .divider { border-top:1px solid #e2e8f0;
      margin:12px 0; }
    table { width:100%;
      border-collapse:collapse; }
    th { background:#f1f5f9; padding:8px 10px;
      text-align:left; font-size:10px;
      font-weight:600; color:#475569;
      text-transform:uppercase; }
    td { padding:8px 10px;
      border-bottom:1px solid #f1f5f9;
      font-size:12px; }
    .total-row td { font-weight:700;
      font-size:13px;
      background:#f8fafc;
      border-top:2px solid #e2e8f0; }
    .grand-net { color:#2563eb;
      font-size:15px; font-weight:800; }
  </style>
</head>
<body>

  <div style="display:flex;
    justify-content:space-between;
    align-items:flex-start;
    margin-bottom:16px;">
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <p style="color:#64748b;font-size:13px;">
        Salary Summary Report
      </p>
      ${deptLine}
    </div>
    <div style="text-align:right;
      font-size:11px;color:#64748b;">
      <p>Period: ${escapeHtml(fmtDate(fromDate))} — 
        ${escapeHtml(fmtDate(toDate))}</p>
      <p>Generated: ${escapeHtml(fmtDate(new Date().toISOString()))}</p>
      <p>Total employees: ${employees.length}</p>
    </div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th>Department</th>
        <th style="text-align:right;">
          Base Salary</th>
        <th style="text-align:right;">
          Overtime</th>
        <th style="text-align:right;">
          Bonus</th>
        <th style="text-align:right;">
          Deductions</th>
        <th style="text-align:right;">
          Net Salary</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">
          TOTAL (${employees.length} employees)
        </td>
        <td style="text-align:right;">
          ${fmt(grandTotal.base)}</td>
        <td style="text-align:right;
          color:#16a34a;">
          ${grandTotal.overtime > 0 ? `+ ${fmt(grandTotal.overtime)}` : '—'}
        </td>
        <td style="text-align:right;
          color:#16a34a;">
          ${grandTotal.bonus > 0 ? `+ ${fmt(grandTotal.bonus)}` : '—'}
        </td>
        <td style="text-align:right;
          color:#dc2626;">
          ${grandTotal.deductions > 0 ? `- ${fmt(grandTotal.deductions)}` : '—'}
        </td>
        <td class="grand-net"
          style="text-align:right;">
          ${fmt(grandTotal.net)}
        </td>
      </tr>
    </tfoot>
  </table>

</body>
</html>`
}

export function buildEmployeePerformancePdf(params: {
  employees: Array<{
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
  }>
  fromDate: string
  toDate: string
  department: string
  storeName: string
  currencySymbol: string
}): string {
  const { employees, fromDate, toDate, storeName, currencySymbol } = params

  const fmt = (n: number) => `${currencySymbol} ${n.toFixed(2)}`
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const totals = employees.reduce(
    (acc, e) => {
      acc.jobs += e.total_jobs
      acc.hours += e.total_hours
      acc.revenue += e.total_revenue
      return acc
    },
    { jobs: 0, hours: 0, revenue: 0 },
  )

  const rows = employees
    .map(
      (e, i) => `
    <tr style="${i % 2 === 0 ? '' : 'background:#f8fafc'}">
      <td style="padding:8px 10px;">
        <p style="font-weight:500;
          font-size:12px;">
          ${e.full_name}
        </p>
        <p style="font-size:10px;
          color:#64748b;
          font-family:monospace;">
          ${e.employee_code}
        </p>
      </td>
      <td style="padding:8px 10px;
        text-align:center;font-size:11px;
        color:#64748b;text-transform:capitalize;">
        ${e.department || '—'}
      </td>
      <td style="padding:8px 10px;
        text-align:center;font-weight:600;">
        ${e.total_jobs}
      </td>
      <td style="padding:8px 10px;
        text-align:center;font-size:12px;">
        ${e.total_hours > 0 ? e.total_hours.toFixed(1) + 'h' : '—'}
      </td>
      <td style="padding:8px 10px;
        text-align:right;font-weight:600;
        color:#2563eb;">
        ${fmt(e.total_revenue)}
      </td>
      <td style="padding:8px 10px;
        text-align:right;font-size:11px;
        color:#64748b;">
        ${fmt(e.avg_revenue_per_job)}
      </td>
      <td style="padding:8px 10px;
        text-align:center;font-size:11px;">
        ${e.mechanical_jobs > 0 ? `<span style="color:#3b82f6;">M:${e.mechanical_jobs}</span>` : ''}
        ${e.programming_jobs > 0 ? `<span style="color:#f97316;margin-left:4px;">P:${e.programming_jobs}</span>` : ''}
        ${e.both_jobs > 0 ? `<span style="color:#22c55e;margin-left:4px;">B:${e.both_jobs}</span>` : ''}
      </td>
    </tr>
  `,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    * { box-sizing:border-box;
        margin:0; padding:0; }
    body {
      font-family:'Segoe UI',Arial,sans-serif;
      color:#1e293b; font-size:12px;
    }
    h1 { font-size:20px; font-weight:700; }
    .divider {
      border-top:1px solid #e2e8f0;
      margin:12px 0;
    }
    table {
      width:100%;
      border-collapse:collapse;
    }
    th {
      background:#f1f5f9;
      padding:8px 10px;
      text-align:left;
      font-size:10px;
      font-weight:600;
      color:#475569;
      text-transform:uppercase;
    }
    .total-row td {
      font-weight:700;
      font-size:13px;
      background:#f1f5f9;
      border-top:2px solid #e2e8f0;
    }
  </style>
</head>
<body>

  <div style="display:flex;
    justify-content:space-between;
    align-items:flex-start;
    margin-bottom:16px;">
    <div>
      <h1>${storeName}</h1>
      <p style="color:#64748b;font-size:13px;">
        Employee Performance Report
      </p>
    </div>
    <div style="text-align:right;
      font-size:11px;color:#64748b;">
      <p>Period: ${fmtDate(fromDate)} —
        ${fmtDate(toDate)}</p>
      <p>Generated: ${fmtDate(new Date().toISOString())}</p>
      <p>Employees: ${employees.length}</p>
    </div>
  </div>

  <div class="divider"></div>

  <div style="display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:12px;margin-bottom:16px;">
    <div style="background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;padding:12px;
      text-align:center;">
      <p style="font-size:10px;color:#64748b;">
        Total Jobs
      </p>
      <p style="font-size:24px;font-weight:700;">
        ${totals.jobs}
      </p>
    </div>
    <div style="background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;padding:12px;
      text-align:center;">
      <p style="font-size:10px;color:#64748b;">
        Total Hours
      </p>
      <p style="font-size:24px;font-weight:700;">
        ${totals.hours.toFixed(1)}h
      </p>
    </div>
    <div style="background:#eff6ff;
      border:1px solid #bfdbfe;
      border-radius:8px;padding:12px;
      text-align:center;">
      <p style="font-size:10px;color:#64748b;">
        Total Revenue
      </p>
      <p style="font-size:24px;font-weight:700;
        color:#2563eb;">
        ${fmt(totals.revenue)}
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th style="text-align:center;">Dept</th>
        <th style="text-align:center;">Jobs</th>
        <th style="text-align:center;">Hours</th>
        <th style="text-align:right;">Revenue</th>
        <th style="text-align:right;">Avg/Job</th>
        <th style="text-align:center;">
          Breakdown
        </th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">
          TOTAL (${employees.length} employees)
        </td>
        <td style="text-align:center;">
          ${totals.jobs}
        </td>
        <td style="text-align:center;">
          ${totals.hours.toFixed(1)}h
        </td>
        <td style="text-align:right;
          color:#2563eb;">
          ${fmt(totals.revenue)}
        </td>
        <td style="text-align:right;">
          ${employees.length > 0 ? fmt(totals.revenue / employees.length) : fmt(0)}
        </td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:16px;
    font-size:10px;color:#94a3b8;">
    M = Mechanical · P = Programming ·
    B = Both departments
  </div>

</body>
</html>`
}
