import ExcelJS from 'exceljs'
import {
  buildAlignedSalesChart,
  mergeTopProducts,
  type ProfitRow,
  type SaleRow,
  type TopProductRow,
} from './reportComparisonData'
import type { DateRange } from './reportComparisonRanges'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2563EB' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }

const POS_DELTA: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCFCE7' },
}

const NEG_DELTA: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEE2E2' },
}

function currencyFmt(symbol: string): string {
  return `"${symbol}" #,##0.00`
}

function pctFmt(): string {
  return '0.00%'
}

function dateFmt(): string {
  return 'yyyy-mm-dd'
}

export function sanitizeFilename(s: string): string {
  return s.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120)
}

export function downloadXlsxBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function addMetaBlock(
  sheet: ExcelJS.Worksheet,
  title: string,
  periodLine: string,
  extra?: string,
): number {
  let r = 1
  sheet.mergeCells(r, 1, r, 8)
  sheet.getCell(r, 1).value = title
  sheet.getCell(r, 1).font = { bold: true, size: 14 }
  r++
  sheet.mergeCells(r, 1, r, 8)
  sheet.getCell(r, 1).value = periodLine
  sheet.getCell(r, 1).font = { size: 11, color: { argb: 'FF475569' } }
  r++
  sheet.mergeCells(r, 1, r, 8)
  sheet.getCell(r, 1).value = `Generated: ${new Date().toLocaleString()}${extra ? ` · ${extra}` : ''}`
  sheet.getCell(r, 1).font = { size: 10, italic: true, color: { argb: 'FF64748B' } }
  r++
  return r
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, row: number, cols: number): void {
  for (let c = 1; c <= cols; c++) {
    const cell = sheet.getRow(row).getCell(c)
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  }
  sheet.getRow(row).height = 22
}

function freezeBelowHeader(sheet: ExcelJS.Worksheet, headerRow: number): void {
  sheet.views = [
    {
      state: 'frozen',
      ySplit: headerRow,
      activeCell: `A${headerRow + 1}`,
      showGridLines: true,
    },
  ]
}

function autoWidth(sheet: ExcelJS.Worksheet, maxCol: number): void {
  for (let c = 1; c <= maxCol; c++) {
    let w = 12
    sheet.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value != null ? String(cell.value).length : 0
      w = Math.max(w, Math.min(48, len + 2))
    })
    sheet.getColumn(c).width = w
  }
}

function aggregateSalesByDay(
  rows: Array<{ created_at: string; total_amount: number }>,
): Array<{ date: string; revenue: number; transactions: number }> {
  const m = new Map<string, { revenue: number; transactions: number }>()
  for (const r of rows) {
    const d = r.created_at.slice(0, 10)
    const x = m.get(d) ?? { revenue: 0, transactions: 0 }
    x.revenue += r.total_amount
    x.transactions += 1
    m.set(d, x)
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }))
}

type SaleRowApi = {
  sale_number: string
  customer_name: string | null
  total_amount: number
  status: string
  created_at: string
}

export async function buildDailySalesExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  dateFrom: string
  dateTo: string
  department: string
  salesRows: SaleRowApi[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, dateFrom, dateTo, department, salesRows } = params
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const daily = aggregateSalesByDay(salesRows)

  const sum = daily.reduce((s, d) => s + d.revenue, 0)

  // Sheet 1 — Daily summary (date, revenue, transactions)
  const s1 = wb.addWorksheet('Daily Sales', {
    properties: { tabColor: { argb: 'FF2563EB' } },
  })
  let r = addMetaBlock(
    s1,
    `${storeName} — Daily Sales`,
    `Period: ${dateFrom} → ${dateTo} · Department: ${department}`,
  )
  r++
  const h1 = r
  s1.getRow(r).values = ['Date', 'Revenue', 'Transactions', 'Running total']
  styleHeaderRow(s1, r, 4)
  r++
  let run = 0
  for (const d of daily) {
    run += d.revenue
    const row = s1.getRow(r)
    row.getCell(1).value = d.date
    row.getCell(1).numFmt = dateFmt()
    row.getCell(2).value = d.revenue
    row.getCell(2).numFmt = currencyFmt(currencySymbol)
    row.getCell(3).value = d.transactions
    row.getCell(4).value = run
    row.getCell(4).numFmt = currencyFmt(currencySymbol)
    r++
  }
  s1.getRow(r).values = ['Total', sum, salesRows.length, '—']
  s1.getRow(r).font = { bold: true }
  s1.getCell(r, 2).numFmt = currencyFmt(currencySymbol)
  freezeBelowHeader(s1, h1)
  autoWidth(s1, 4)

  // Sheet 2 — Transactions
  const s2 = wb.addWorksheet('Transactions', {
    properties: { tabColor: { argb: 'FF64748B' } },
  })
  r = addMetaBlock(s2, `${storeName} — Sales transactions`, `Period: ${dateFrom} → ${dateTo}`)
  r++
  const h2 = r
  s2.getRow(r).values = ['Invoice', 'Customer', 'Date', `Amount (${currencySymbol})`, 'Status']
  styleHeaderRow(s2, r, 5)
  r++
  for (const row of salesRows) {
    const rr = s2.getRow(r)
    rr.getCell(1).value = row.sale_number
    rr.getCell(2).value = row.customer_name ?? 'Walk-in'
    rr.getCell(3).value = row.created_at.slice(0, 10)
    rr.getCell(3).numFmt = dateFmt()
    rr.getCell(4).value = row.total_amount
    rr.getCell(4).numFmt = currencyFmt(currencySymbol)
    rr.getCell(5).value = row.status
    r++
  }
  freezeBelowHeader(s2, h2)
  autoWidth(s2, 5)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function buildProfitExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  dateFrom: string
  dateTo: string
  department: string
  profitRows: ProfitRow[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, dateFrom, dateTo, department, profitRows } = params
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const totalRev = profitRows.reduce((s, x) => s + x.revenue, 0)
  const totalCogs = profitRows.reduce((s, x) => s + x.cogs, 0)
  const totalGp = profitRows.reduce((s, x) => s + x.gross_profit, 0)
  const margin = totalRev > 0 ? totalGp / totalRev : 0

  const sheet = wb.addWorksheet('Profit Summary', { properties: { tabColor: { argb: 'FF16A34A' } } })
  let r = addMetaBlock(
    sheet,
    `${storeName} — Profit Report`,
    `Period: ${dateFrom} → ${dateTo} · Department: ${department}`,
  )
  const metrics: [string, number, 'cur' | 'pct'][] = [
    ['Total revenue', totalRev, 'cur'],
    ['Total cost (COGS)', totalCogs, 'cur'],
    ['Gross profit', totalGp, 'cur'],
    ['Margin %', margin, 'pct'],
  ]
  for (const [label, val, kind] of metrics) {
    const row = sheet.getRow(r)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true }
    row.getCell(2).value = val
    row.getCell(2).numFmt = kind === 'pct' ? pctFmt() : currencyFmt(currencySymbol)
    r++
  }
  r++
  const h = r
  sheet.getRow(r).values = ['Date', 'Revenue', 'COGS', 'Gross profit', 'Margin %']
  styleHeaderRow(sheet, r, 5)
  r++
  for (const p of profitRows) {
    const m = p.revenue > 0 ? p.gross_profit / p.revenue : 0
    const row = sheet.getRow(r)
    row.getCell(1).value = p.day.slice(0, 10)
    row.getCell(1).numFmt = dateFmt()
    row.getCell(2).value = p.revenue
    row.getCell(2).numFmt = currencyFmt(currencySymbol)
    row.getCell(3).value = p.cogs
    row.getCell(3).numFmt = currencyFmt(currencySymbol)
    row.getCell(4).value = p.gross_profit
    row.getCell(4).numFmt = currencyFmt(currencySymbol)
    row.getCell(5).value = m
    row.getCell(5).numFmt = pctFmt()
    r++
  }
  freezeBelowHeader(sheet, h)
  autoWidth(sheet, 5)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function buildTopProductsExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  dateFrom: string
  dateTo: string
  department: string
  rows: TopProductRow[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, dateFrom, dateTo, department, rows } = params
  const sorted = [...rows].sort((a, b) => b.total_revenue - a.total_revenue)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Top Products', { properties: { tabColor: { argb: 'FFCA8A04' } } })
  let r = addMetaBlock(
    sheet,
    `${storeName} — Top Products`,
    `Period: ${dateFrom} → ${dateTo} · Department: ${department}`,
  )
  r++
  const h = r
  sheet.getRow(r).values = [
    'Rank',
    'Product',
    'SKU',
    'Units sold',
    `Revenue (${currencySymbol})`,
    `COGS (${currencySymbol})`,
    `Profit (${currencySymbol})`,
    'Margin %',
  ]
  styleHeaderRow(sheet, r, 8)
  r++
  sorted.forEach((p, idx) => {
    const m = p.total_revenue > 0 ? p.profit / p.total_revenue : 0
    const row = sheet.getRow(r)
    row.getCell(1).value = idx + 1
    row.getCell(2).value = p.product_name
    row.getCell(3).value = p.product_sku ?? '—'
    row.getCell(4).value = p.total_qty
    row.getCell(5).value = p.total_revenue
    row.getCell(5).numFmt = currencyFmt(currencySymbol)
    row.getCell(6).value = p.total_cost
    row.getCell(6).numFmt = currencyFmt(currencySymbol)
    row.getCell(7).value = p.profit
    row.getCell(7).numFmt = currencyFmt(currencySymbol)
    row.getCell(8).value = m
    row.getCell(8).numFmt = pctFmt()
    r++
  })
  freezeBelowHeader(sheet, h)
  autoWidth(sheet, 8)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

/** Sales comparison: Daily Compare + Transactions P1 + Transactions P2 */
export async function buildDailySalesComparisonExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  department: string
  p1: DateRange
  p2: DateRange
  rows1: SaleRow[]
  rows2: SaleRow[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, department, p1, p2, rows1, rows2 } = params
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const aligned = buildAlignedSalesChart(rows1, rows2)

  const cmp = wb.addWorksheet('Daily Compare', { properties: { tabColor: { argb: 'FF2563EB' } } })
  let r = addMetaBlock(
    cmp,
    `${storeName} — Daily Sales (Comparison)`,
    `P1: ${p1.from} → ${p1.to} · P2: ${p2.from} → ${p2.to} · ${department}`,
  )
  r++
  const h = r
  cmp.getRow(r).values = [
    'Day #',
    'P1 date',
    `P1 revenue (${currencySymbol})`,
    'P2 date',
    `P2 revenue (${currencySymbol})`,
    `Delta (${currencySymbol})`,
    'Delta %',
  ]
  styleHeaderRow(cmp, r, 7)
  r++
  for (const row of aligned) {
    const delta = row.revenue2 - row.revenue1
    const pct = row.revenue1 > 0.005 ? (row.revenue2 - row.revenue1) / row.revenue1 : null
    const rr = cmp.getRow(r)
    rr.getCell(1).value = row.idx
    rr.getCell(2).value = row.day1 ?? '—'
    rr.getCell(3).value = row.revenue1
    rr.getCell(3).numFmt = currencyFmt(currencySymbol)
    rr.getCell(4).value = row.day2 ?? '—'
    rr.getCell(5).value = row.revenue2
    rr.getCell(5).numFmt = currencyFmt(currencySymbol)
    rr.getCell(6).value = delta
    rr.getCell(6).numFmt = currencyFmt(currencySymbol)
    if (delta > 0) rr.getCell(6).fill = POS_DELTA
    else if (delta < 0) rr.getCell(6).fill = NEG_DELTA
    rr.getCell(7).value = pct != null ? pct : ''
    rr.getCell(7).numFmt = pct != null ? pctFmt() : '@'
    if (pct != null && pct > 0) rr.getCell(7).fill = POS_DELTA
    else if (pct != null && pct < 0) rr.getCell(7).fill = NEG_DELTA
    r++
  }
  freezeBelowHeader(cmp, h)
  autoWidth(cmp, 7)

  const t1 = wb.addWorksheet(`P1 Transactions`, {
    properties: { tabColor: { argb: 'FF93C5FD' } },
  })
  r = addMetaBlock(t1, `Period 1 transactions`, `${p1.from} → ${p1.to}`)
  r++
  const h1 = r
  t1.getRow(r).values = ['Invoice', 'Customer', 'Date', `Amount (${currencySymbol})`, 'Status']
  styleHeaderRow(t1, r, 5)
  r++
  for (const row of rows1) {
    const rr = t1.getRow(r)
    rr.getCell(1).value = row.sale_number
    rr.getCell(2).value = row.customer_name ?? 'Walk-in'
    rr.getCell(3).value = row.created_at.slice(0, 10)
    rr.getCell(4).value = row.total_amount
    rr.getCell(4).numFmt = currencyFmt(currencySymbol)
    rr.getCell(5).value = row.status
    r++
  }
  freezeBelowHeader(t1, h1)
  autoWidth(t1, 5)

  const t2 = wb.addWorksheet(`P2 Transactions`, {
    properties: { tabColor: { argb: 'FFFDBA74' } },
  })
  r = addMetaBlock(t2, `Period 2 transactions`, `${p2.from} → ${p2.to}`)
  r++
  const h2 = r
  t2.getRow(r).values = ['Invoice', 'Customer', 'Date', `Amount (${currencySymbol})`, 'Status']
  styleHeaderRow(t2, r, 5)
  r++
  for (const row of rows2) {
    const rr = t2.getRow(r)
    rr.getCell(1).value = row.sale_number
    rr.getCell(2).value = row.customer_name ?? 'Walk-in'
    rr.getCell(3).value = row.created_at.slice(0, 10)
    rr.getCell(4).value = row.total_amount
    rr.getCell(4).numFmt = currencyFmt(currencySymbol)
    rr.getCell(5).value = row.status
    r++
  }
  freezeBelowHeader(t2, h2)
  autoWidth(t2, 5)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function buildProfitComparisonExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  department: string
  p1: DateRange
  p2: DateRange
  profit1: ProfitRow[]
  profit2: ProfitRow[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, department, p1, p2, profit1, profit2 } = params
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const t1 = profit1.reduce(
    (s, x) => ({ rev: s.rev + x.revenue, cogs: s.cogs + x.cogs, gp: s.gp + x.gross_profit }),
    { rev: 0, cogs: 0, gp: 0 },
  )
  const t2 = profit2.reduce(
    (s, x) => ({ rev: s.rev + x.revenue, cogs: s.cogs + x.cogs, gp: s.gp + x.gross_profit }),
    { rev: 0, cogs: 0, gp: 0 },
  )
  const m1 = t1.rev > 0 ? t1.gp / t1.rev : 0
  const m2 = t2.rev > 0 ? t2.gp / t2.rev : 0

  const sum = wb.addWorksheet('Summary Compare', { properties: { tabColor: { argb: 'FF16A34A' } } })
  let r = addMetaBlock(
    sum,
    `${storeName} — Profit (Comparison)`,
    `P1: ${p1.from} → ${p1.to} · P2: ${p2.from} → ${p2.to} · ${department}`,
  )
  r++
  const h = r
  sum.getRow(r).values = ['Metric', `P1 (${p1.label})`, `P2 (${p2.label})`, 'Delta', 'Delta %']
  styleHeaderRow(sum, r, 5)
  r++
  const rows: [string, number, number, 'money' | 'margin'][] = [
    ['Revenue', t1.rev, t2.rev, 'money'],
    ['COGS', t1.cogs, t2.cogs, 'money'],
    ['Gross profit', t1.gp, t2.gp, 'money'],
    ['Margin %', m1, m2, 'margin'],
  ]
  for (const [label, a, b, kind] of rows) {
    const row = sum.getRow(r)
    row.getCell(1).value = label
    if (kind === 'margin') {
      const delta = b - a
      const rel = a > 0.005 ? (b - a) / a : null
      row.getCell(2).value = a
      row.getCell(2).numFmt = pctFmt()
      row.getCell(3).value = b
      row.getCell(3).numFmt = pctFmt()
      row.getCell(4).value = delta
      row.getCell(4).numFmt = pctFmt()
      if (delta > 0) row.getCell(4).fill = POS_DELTA
      else if (delta < 0) row.getCell(4).fill = NEG_DELTA
      row.getCell(5).value = rel != null ? rel : '—'
      if (rel != null) {
        row.getCell(5).numFmt = pctFmt()
        if (rel > 0) row.getCell(5).fill = POS_DELTA
        else if (rel < 0) row.getCell(5).fill = NEG_DELTA
      }
    } else {
      const delta = b - a
      const pct = a > 0.005 ? (b - a) / a : null
      row.getCell(2).value = a
      row.getCell(2).numFmt = currencyFmt(currencySymbol)
      row.getCell(3).value = b
      row.getCell(3).numFmt = currencyFmt(currencySymbol)
      row.getCell(4).value = delta
      row.getCell(4).numFmt = currencyFmt(currencySymbol)
      if (delta > 0) row.getCell(4).fill = POS_DELTA
      else if (delta < 0) row.getCell(4).fill = NEG_DELTA
      row.getCell(5).value = pct != null ? pct : '—'
      if (pct != null) {
        row.getCell(5).numFmt = pctFmt()
        if (pct > 0) row.getCell(5).fill = POS_DELTA
        else if (pct < 0) row.getCell(5).fill = NEG_DELTA
      }
    }
    r++
  }
  freezeBelowHeader(sum, h)
  autoWidth(sum, 5)

  const d1 = wb.addWorksheet('P1 Daily', { properties: { tabColor: { argb: 'FF93C5FD' } } })
  r = addMetaBlock(d1, 'Period 1 — daily breakdown', `${p1.from} → ${p1.to}`)
  r++
  const hd1 = r
  d1.getRow(r).values = ['Date', 'Revenue', 'COGS', 'Gross profit', 'Margin %']
  styleHeaderRow(d1, r, 5)
  r++
  for (const p of profit1) {
    const m = p.revenue > 0 ? p.gross_profit / p.revenue : 0
    const row = d1.getRow(r)
    row.getCell(1).value = p.day.slice(0, 10)
    row.getCell(1).numFmt = dateFmt()
    row.getCell(2).value = p.revenue
    row.getCell(2).numFmt = currencyFmt(currencySymbol)
    row.getCell(3).value = p.cogs
    row.getCell(3).numFmt = currencyFmt(currencySymbol)
    row.getCell(4).value = p.gross_profit
    row.getCell(4).numFmt = currencyFmt(currencySymbol)
    row.getCell(5).value = m
    row.getCell(5).numFmt = pctFmt()
    r++
  }
  freezeBelowHeader(d1, hd1)
  autoWidth(d1, 5)

  const d2 = wb.addWorksheet('P2 Daily', { properties: { tabColor: { argb: 'FFFDBA74' } } })
  r = addMetaBlock(d2, 'Period 2 — daily breakdown', `${p2.from} → ${p2.to}`)
  r++
  const hd2 = r
  d2.getRow(r).values = ['Date', 'Revenue', 'COGS', 'Gross profit', 'Margin %']
  styleHeaderRow(d2, r, 5)
  r++
  for (const p of profit2) {
    const m = p.revenue > 0 ? p.gross_profit / p.revenue : 0
    const row = d2.getRow(r)
    row.getCell(1).value = p.day.slice(0, 10)
    row.getCell(1).numFmt = dateFmt()
    row.getCell(2).value = p.revenue
    row.getCell(2).numFmt = currencyFmt(currencySymbol)
    row.getCell(3).value = p.cogs
    row.getCell(3).numFmt = currencyFmt(currencySymbol)
    row.getCell(4).value = p.gross_profit
    row.getCell(4).numFmt = currencyFmt(currencySymbol)
    row.getCell(5).value = m
    row.getCell(5).numFmt = pctFmt()
    r++
  }
  freezeBelowHeader(d2, hd2)
  autoWidth(d2, 5)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function buildTopProductsComparisonExcelBuffer(params: {
  storeName: string
  currencySymbol: string
  department: string
  p1: DateRange
  p2: DateRange
  rows1: TopProductRow[]
  rows2: TopProductRow[]
}): Promise<ArrayBuffer> {
  const { storeName, currencySymbol, department, p1, p2, rows1, rows2 } = params
  const merged = mergeTopProducts(rows1, rows2)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mahali Garage'
  wb.created = new Date()

  const sheet = wb.addWorksheet('Top Products Compare', { properties: { tabColor: { argb: 'FFCA8A04' } } })
  let r = addMetaBlock(
    sheet,
    `${storeName} — Top Products (Comparison)`,
    `P1: ${p1.from} → ${p1.to} · P2: ${p2.from} → ${p2.to} · ${department}`,
  )
  r++
  const h = r
  sheet.getRow(r).values = [
    'Product',
    'Qty P1',
    `Rev P1 (${currencySymbol})`,
    'Qty P2',
    `Rev P2 (${currencySymbol})`,
    `Delta rev (${currencySymbol})`,
    'Delta %',
  ]
  styleHeaderRow(sheet, r, 7)
  r++
  for (const m of merged) {
    const pct = m.deltaPct
    const row = sheet.getRow(r)
    row.getCell(1).value = m.product_name
    row.getCell(2).value = m.qty1
    row.getCell(3).value = m.rev1
    row.getCell(3).numFmt = currencyFmt(currencySymbol)
    row.getCell(4).value = m.qty2
    row.getCell(5).value = m.rev2
    row.getCell(5).numFmt = currencyFmt(currencySymbol)
    row.getCell(6).value = m.deltaRev
    row.getCell(6).numFmt = currencyFmt(currencySymbol)
    if (m.deltaRev > 0) row.getCell(6).fill = POS_DELTA
    else if (m.deltaRev < 0) row.getCell(6).fill = NEG_DELTA
    if (pct != null && Number.isFinite(pct)) {
      row.getCell(7).value = pct / 100
      row.getCell(7).numFmt = pctFmt()
      if (pct > 0) row.getCell(7).fill = POS_DELTA
      else if (pct < 0) row.getCell(7).fill = NEG_DELTA
    } else {
      row.getCell(7).value = '—'
    }
    r++
  }
  freezeBelowHeader(sheet, h)
  autoWidth(sheet, 7)

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export function excelFilename(parts: {
  report: string
  dateFrom: string
  dateTo: string
  dept: string
  compare?: boolean
}): string {
  const cmp = parts.compare ? 'Comparison-' : ''
  return sanitizeFilename(`${cmp}${parts.report}-${parts.dateFrom}-to-${parts.dateTo}-${parts.dept}.xlsx`)
}
