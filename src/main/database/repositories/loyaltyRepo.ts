import { getDb } from '../index'
import { settingsRepo } from './settingsRepo'

export interface LoyaltyRow {
  id?: number
  customer_id: number
  points: number
  stamps: number
  total_visits: number
  tier_level: number
  updated_at?: string
}

export interface LoyaltyTransaction {
  id: number
  customer_id: number
  type: string
  points_delta: number
  stamps_delta: number
  visits_delta: number
  source: string | null
  source_id: number | null
  note: string | null
  created_by: number | null
  created_at: string
}

interface LoyaltyConfigJson {
  enabled?: boolean
  type?: 'points' | 'stamps' | 'tiers' | 'all'
  pointsPerAed?: number
  stampsPerVisit?: number
  tier1Visits?: number
  tier2Visits?: number
  tier3Visits?: number
}

function parseLoyaltyConfig(): LoyaltyConfigJson | null {
  const raw = settingsRepo.get('loyalty.config')
  if (!raw) return null
  try {
    return JSON.parse(raw) as LoyaltyConfigJson
  } catch {
    return null
  }
}

function typeIncludesPoints(cfg: LoyaltyConfigJson): boolean {
  const t = cfg.type ?? 'points'
  return t === 'points' || t === 'all'
}

function typeIncludesStamps(cfg: LoyaltyConfigJson): boolean {
  const t = cfg.type ?? 'points'
  return t === 'stamps' || t === 'all'
}

function typeIncludesTiers(cfg: LoyaltyConfigJson): boolean {
  const t = cfg.type ?? 'points'
  return t === 'tiers' || t === 'all'
}

export function computeTierLevel(totalVisits: number, cfg: LoyaltyConfigJson): number {
  const t1 = cfg.tier1Visits ?? 5
  const t2 = cfg.tier2Visits ?? 10
  const t3 = cfg.tier3Visits ?? 20
  if (totalVisits >= t3) return 3
  if (totalVisits >= t2) return 2
  if (totalVisits >= t1) return 1
  return 0
}

export function getLoyalty(customerId: number): LoyaltyRow {
  const row = getDb()
    .prepare(
      `SELECT id, customer_id, points, stamps, total_visits, tier_level, updated_at
       FROM customer_loyalty WHERE customer_id = ?`
    )
    .get(customerId) as
    | {
        id: number
        customer_id: number
        points: number
        stamps: number
        total_visits: number
        tier_level: number
        updated_at: string
      }
    | undefined

  if (!row) {
    return {
      customer_id: customerId,
      points: 0,
      stamps: 0,
      total_visits: 0,
      tier_level: 0,
    }
  }
  return {
    id: row.id,
    customer_id: row.customer_id,
    points: row.points,
    stamps: row.stamps,
    total_visits: row.total_visits,
    tier_level: row.tier_level,
    updated_at: row.updated_at,
  }
}

export function upsertLoyalty(
  customerId: number,
  data: {
    points?: number
    stamps?: number
    total_visits?: number
    tier_level?: number
  }
): void {
  const cur = getLoyalty(customerId)
  const merged: LoyaltyRow = {
    ...cur,
    ...data,
    customer_id: customerId,
  }
  getDb()
    .prepare(
      `INSERT INTO customer_loyalty (customer_id, points, stamps, total_visits, tier_level, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(customer_id) DO UPDATE SET
         points = excluded.points,
         stamps = excluded.stamps,
         total_visits = excluded.total_visits,
         tier_level = excluded.tier_level,
         updated_at = datetime('now')`
    )
    .run(
      merged.customer_id,
      merged.points,
      merged.stamps,
      merged.total_visits,
      merged.tier_level
    )
}

export function addTransaction(tx: {
  customer_id: number
  type: string
  points_delta: number
  stamps_delta: number
  visits_delta: number
  source?: string
  source_id?: number
  note?: string
  created_by?: number
}): void {
  const run = getDb().transaction(() => {
    getDb()
      .prepare(
        `INSERT INTO loyalty_transactions (
           customer_id, type, points_delta, stamps_delta, visits_delta,
           source, source_id, note, created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        tx.customer_id,
        tx.type,
        tx.points_delta,
        tx.stamps_delta,
        tx.visits_delta,
        tx.source ?? null,
        tx.source_id ?? null,
        tx.note ?? null,
        tx.created_by ?? null
      )

    const cur = getLoyalty(tx.customer_id)
    upsertLoyalty(tx.customer_id, {
      points: cur.points + tx.points_delta,
      stamps: cur.stamps + tx.stamps_delta,
      total_visits: cur.total_visits + tx.visits_delta,
      tier_level: cur.tier_level,
    })
  })
  run()
}

export function getTransactions(customerId: number, limit = 20): LoyaltyTransaction[] {
  return getDb()
    .prepare(
      `SELECT id, customer_id, type, points_delta, stamps_delta, visits_delta,
              source, source_id, note, created_by, created_at
       FROM loyalty_transactions
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(customerId, limit) as LoyaltyTransaction[]
}

export function processAutoEarn(
  customerId: number,
  amount: number,
  source: 'invoice' | 'receipt',
  sourceId: number,
  createdBy: number
): void {
  const cfg = parseLoyaltyConfig()
  if (!cfg || !cfg.enabled) return

  let pointsDelta = 0
  let stampsDelta = 0
  const visitsDelta = 1

  if (typeIncludesPoints(cfg)) {
    const ppa = Number(cfg.pointsPerAed ?? 1)
    pointsDelta = Math.floor(amount * (Number.isFinite(ppa) ? ppa : 1))
  }
  if (typeIncludesStamps(cfg)) {
    const spv = Number(cfg.stampsPerVisit ?? 1)
    stampsDelta = Number.isFinite(spv) ? Math.floor(spv) : 1
  }

  let txType = 'earn_points'
  if (pointsDelta <= 0 && stampsDelta > 0) txType = 'earn_stamps'
  else if (pointsDelta > 0 && stampsDelta <= 0) txType = 'earn_points'
  else if (pointsDelta > 0 && stampsDelta > 0) txType = 'earn_points'

  addTransaction({
    customer_id: customerId,
    type: txType,
    points_delta: pointsDelta,
    stamps_delta: stampsDelta,
    visits_delta: visitsDelta,
    source,
    source_id: sourceId,
    created_by: createdBy,
  })

  if (typeIncludesTiers(cfg)) {
    const row = getLoyalty(customerId)
    const tier = computeTierLevel(row.total_visits, cfg)
    upsertLoyalty(customerId, { tier_level: tier })
  }
}
