import { enumerateDays } from './reportComparisonRanges'

export type SaleRow = {
  sale_number: string
  invoice_number: string | null
  customer_name: string | null
  total_amount: number
  status: string
  created_at: string
}

export type ProfitRow = { day: string; revenue: number; cogs: number; gross_profit: number }

export type TopProductRow = {
  product_name: string
  product_sku: string | null
  total_qty: number
  total_revenue: number
  total_cost: number
  profit: number
}

export function aggregateSalesRevenueByDay(rows: SaleRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    m.set(day, (m.get(day) ?? 0) + r.total_amount)
  }
  return m
}

export function profitRowsToMap(rows: ProfitRow[]): Map<string, ProfitRow> {
  const m = new Map<string, ProfitRow>()
  for (const r of rows) {
    const k = r.day.slice(0, 10)
    m.set(k, r)
  }
  return m
}

/** Sequential day index alignment for two periods (same length cap = max days). */
export function buildAlignedSalesChart(
  rows1: SaleRow[],
  rows2: SaleRow[],
): Array<{ idx: number; revenue1: number; revenue2: number; day1: string | null; day2: string | null }> {
  const m1 = aggregateSalesRevenueByDay(rows1)
  const m2 = aggregateSalesRevenueByDay(rows2)
  const d1 = rows1.length ? enumerateDaysFromRows(rows1) : []
  const d2 = rows2.length ? enumerateDaysFromRows(rows2) : []
  const maxLen = Math.max(d1.length, d2.length)
  const out: Array<{ idx: number; revenue1: number; revenue2: number; day1: string | null; day2: string | null }> = []
  for (let i = 0; i < maxLen; i++) {
    const day1 = d1[i] ?? null
    const day2 = d2[i] ?? null
    out.push({
      idx: i + 1,
      revenue1: day1 ? m1.get(day1) ?? 0 : 0,
      revenue2: day2 ? m2.get(day2) ?? 0 : 0,
      day1,
      day2,
    })
  }
  return out
}

function enumerateDaysFromRows(rows: SaleRow[]): string[] {
  let min = rows[0]!.created_at.slice(0, 10)
  let max = min
  for (const r of rows) {
    const d = r.created_at.slice(0, 10)
    if (d < min) min = d
    if (d > max) max = d
  }
  return enumerateDays(min, max)
}

function profitDayRange(rows: ProfitRow[]): string[] {
  if (!rows.length) return []
  let min = rows[0]!.day.slice(0, 10)
  let max = min
  for (const r of rows) {
    const d = r.day.slice(0, 10)
    if (d < min) min = d
    if (d > max) max = d
  }
  return enumerateDays(min, max)
}

export function buildAlignedProfitChart(
  rows1: ProfitRow[],
  rows2: ProfitRow[],
): Array<{
  idx: number
  revenue1: number
  revenue2: number
  profit1: number
  profit2: number
  day1: string | null
  day2: string | null
}> {
  const days1 = rows1.length ? profitDayRange(rows1) : []
  const days2 = rows2.length ? profitDayRange(rows2) : []
  const m1 = profitRowsToMap(rows1)
  const m2 = profitRowsToMap(rows2)
  const maxLen = Math.max(days1.length, days2.length)
  const out: Array<{
    idx: number
    revenue1: number
    revenue2: number
    profit1: number
    profit2: number
    day1: string | null
    day2: string | null
  }> = []
  for (let i = 0; i < maxLen; i++) {
    const d1 = days1[i] ?? null
    const d2 = days2[i] ?? null
    const p1 = d1 ? m1.get(d1) : undefined
    const p2 = d2 ? m2.get(d2) : undefined
    out.push({
      idx: i + 1,
      revenue1: p1?.revenue ?? 0,
      revenue2: p2?.revenue ?? 0,
      profit1: p1?.gross_profit ?? 0,
      profit2: p2?.gross_profit ?? 0,
      day1: d1,
      day2: d2,
    })
  }
  return out
}

export type MergedTopProduct = {
  product_name: string
  qty1: number
  rev1: number
  qty2: number
  rev2: number
  deltaRev: number
  deltaPct: number | null
}

export function mergeTopProducts(rows1: TopProductRow[], rows2: TopProductRow[]): MergedTopProduct[] {
  const map = new Map<string, MergedTopProduct>()
  for (const r of rows1) {
    map.set(r.product_name, {
      product_name: r.product_name,
      qty1: r.total_qty,
      rev1: r.total_revenue,
      qty2: 0,
      rev2: 0,
      deltaRev: 0,
      deltaPct: null,
    })
  }
  for (const r of rows2) {
    const ex = map.get(r.product_name)
    if (ex) {
      ex.qty2 = r.total_qty
      ex.rev2 = r.total_revenue
    } else {
      map.set(r.product_name, {
        product_name: r.product_name,
        qty1: 0,
        rev1: 0,
        qty2: r.total_qty,
        rev2: r.total_revenue,
        deltaRev: 0,
        deltaPct: null,
      })
    }
  }
  const list = [...map.values()]
  for (const m of list) {
    m.deltaRev = m.rev2 - m.rev1
    m.deltaPct = m.rev1 > 0.005 ? ((m.rev2 - m.rev1) / m.rev1) * 100 : m.rev2 > 0 ? null : 0
  }
  list.sort((a, b) => Math.max(b.rev1, b.rev2) - Math.max(a.rev1, a.rev2))
  return list
}

export function pctChange(prev: number, next: number): { text: string; up: boolean | null } {
  if (prev > 0.005) {
    const p = ((next - prev) / prev) * 100
    return { text: `${p >= 0 ? '↑' : '↓'}${Math.abs(p).toFixed(1)}%`, up: p > 0 ? true : p < 0 ? false : null }
  }
  if (next > 0.005) return { text: '↑new', up: true }
  return { text: '—', up: null }
}
