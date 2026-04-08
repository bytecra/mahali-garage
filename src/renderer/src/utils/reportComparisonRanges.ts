/** Local calendar helpers for report comparison (avoid UTC off-by-one on Y-M-D strings). */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}

/** Inclusive Y-M-D range using local noon stepping (avoids DST edge issues). */
export function enumerateDays(from: string, to: string): string[] {
  const dates: string[] = []
  const d = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (d <= end) {
    dates.push(toYmdLocal(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export function startOfQuarter(d: Date): Date {
  const m = d.getMonth()
  const q = Math.floor(m / 3) * 3
  return new Date(d.getFullYear(), q, 1)
}

export type DateRange = { from: string; to: string; label: string }

export type ComparisonMode = 'single' | 'mom' | 'qoq' | 'custom'

export type MonthComparisonPreset =
  | 'this_vs_last_month'
  | 'last2_blocks'
  | 'last3_blocks'
  | 'last4_blocks'
  | 'last6_blocks'
  | 'ytd_vs_prior'

export function resolveSingleExportRange(
  exportPeriod: 'weekly' | 'monthly' | 'custom',
  exportDateFrom: string,
  exportDateTo: string,
  exportWeekDate: string,
): { from: string; to: string } {
  const toYmd = (d: Date): string => toYmdLocal(d)
  if (exportPeriod === 'weekly') {
    const base = exportWeekDate.trim() ? new Date(exportWeekDate + 'T12:00:00') : new Date()
    const day = base.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(base)
    monday.setDate(base.getDate() + diff)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: toYmd(monday), to: toYmd(sunday) }
  }
  if (exportPeriod === 'monthly') {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toYmd(start), to: toYmd(end) }
  }
  return { from: exportDateFrom, to: exportDateTo }
}

function rangeLabel(from: string, to: string, title: string): string {
  return `${title}: ${from} → ${to}`
}

/** Previous full calendar quarter strictly before the quarter containing `d`. */
function previousFullQuarter(d: Date): { from: Date; to: Date } {
  const sq = startOfQuarter(d)
  const dayBeforeThisQ = new Date(sq.getFullYear(), sq.getMonth(), 0)
  const prevQStart = startOfQuarter(dayBeforeThisQ)
  const prevQEnd = new Date(prevQStart.getFullYear(), prevQStart.getMonth() + 3, 0)
  return { from: prevQStart, to: prevQEnd }
}

/**
 * Two periods for comparison. Period 1 is always the earlier / baseline block when applicable.
 */
export function resolveComparisonPeriods(
  mode: ComparisonMode,
  monthPreset: MonthComparisonPreset,
  custom: { p1From: string; p1To: string; p2From: string; p2To: string },
): { period1: DateRange; period2: DateRange } | null {
  const now = new Date()

  if (mode === 'custom') {
    const { p1From, p1To, p2From, p2To } = custom
    if (!p1From || !p1To || !p2From || !p2To) return null
    if (p1From > p1To || p2From > p2To) return null
    return {
      period1: { from: p1From, to: p1To, label: rangeLabel(p1From, p1To, 'Period 1') },
      period2: { from: p2From, to: p2To, label: rangeLabel(p2From, p2To, 'Period 2') },
    }
  }

  if (mode === 'qoq') {
    const sq = startOfQuarter(now)
    const { from: pqFrom, to: pqTo } = previousFullQuarter(now)
    const period1: DateRange = {
      from: toYmdLocal(pqFrom),
      to: toYmdLocal(pqTo),
      label: `Prior quarter (${toYmdLocal(pqFrom)} → ${toYmdLocal(pqTo)})`,
    }
    const period2: DateRange = {
      from: toYmdLocal(sq),
      to: toYmdLocal(now),
      label: `Current quarter to date (${toYmdLocal(sq)} → ${toYmdLocal(now)})`,
    }
    return { period1, period2 }
  }

  if (mode !== 'mom') return null

  if (monthPreset === 'this_vs_last_month') {
    const thisMonthStart = startOfMonth(now)
    const lastMonthEnd = endOfMonth(addMonths(now, -1))
    const lastMonthStart = startOfMonth(lastMonthEnd)
    return {
      period1: {
        from: toYmdLocal(lastMonthStart),
        to: toYmdLocal(lastMonthEnd),
        label: 'Last month (full)',
      },
      period2: {
        from: toYmdLocal(thisMonthStart),
        to: toYmdLocal(now),
        label: 'This month (to date)',
      },
    }
  }

  if (monthPreset === 'last2_blocks') {
    const p2Start = startOfMonth(addMonths(now, -1))
    const p1Start = startOfMonth(addMonths(now, -3))
    const p1End = endOfMonth(addMonths(now, -2))
    return {
      period1: {
        from: toYmdLocal(p1Start),
        to: toYmdLocal(p1End),
        label: 'Earlier 2-month block',
      },
      period2: {
        from: toYmdLocal(p2Start),
        to: toYmdLocal(now),
        label: 'Current + previous month',
      },
    }
  }

  const nMap: Record<Exclude<MonthComparisonPreset, 'this_vs_last_month' | 'last2_blocks' | 'ytd_vs_prior'>, number> = {
    last3_blocks: 3,
    last4_blocks: 4,
    last6_blocks: 6,
  }

  if (monthPreset === 'ytd_vs_prior') {
    const y = now.getFullYear()
    const p2From = new Date(y, 0, 1)
    const p1From = new Date(y - 1, 0, 1)
    const p1To = new Date(y - 1, now.getMonth(), now.getDate())
    return {
      period1: {
        from: toYmdLocal(p1From),
        to: toYmdLocal(p1To),
        label: `YTD prior year (${y - 1})`,
      },
      period2: {
        from: toYmdLocal(p2From),
        to: toYmdLocal(now),
        label: `YTD ${y}`,
      },
    }
  }

  const n = nMap[monthPreset as keyof typeof nMap]
  if (!n) return null

  const p2Start = startOfMonth(addMonths(now, -(n - 1)))
  const p1Start = startOfMonth(addMonths(now, -(2 * n - 1)))
  const p1End = endOfMonth(addMonths(now, -n))

  return {
    period1: {
      from: toYmdLocal(p1Start),
      to: toYmdLocal(p1End),
      label: `Prior ${n} months`,
    },
    period2: {
      from: toYmdLocal(p2Start),
      to: toYmdLocal(now),
      label: `Last ${n} months`,
    },
  }
}
