import { getDb } from '../index'

export interface LoyaltyRow {
  id: number
  customer_id: number
  department: 'all' | 'mechanical' | 'programming'
  points: number
  stamps: number
  total_visits: number
  tier_level: number
  updated_at: string
}

export interface LoyaltyTransaction {
  id: number
  customer_id: number
  department: string
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

interface LoyaltyConfig {
  enabled: boolean
  deptMode: 'combined' | 'per_dept'
  type: 'points' | 'stamps' | 'tiers' | 'all'
  pointsPerAed: number
  stampsPerVisit: number
  stampsForReward: number
  tier1Visits: number
  tier1Discount: number
  tier2Visits: number
  tier2Discount: number
  tier3Visits: number
  tier3Discount: number
  autoEarnInvoice: boolean
  autoEarnReceipt: boolean
}

const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: false,
  deptMode: 'combined',
  type: 'points',
  pointsPerAed: 1,
  stampsPerVisit: 1,
  stampsForReward: 10,
  tier1Visits: 5,
  tier1Discount: 5,
  tier2Visits: 10,
  tier2Discount: 10,
  tier3Visits: 20,
  tier3Discount: 15,
  autoEarnInvoice: true,
  autoEarnReceipt: true,
}

function getLoyaltyConfig(): LoyaltyConfig | null {
  const db = getDb()
  const row = db.prepare(
    `SELECT value FROM settings
     WHERE key = 'loyalty.config'`
  ).get() as { value: string } | undefined
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as Partial<LoyaltyConfig>
    return { ...DEFAULT_LOYALTY_CONFIG, ...parsed }
  } catch {
    return null
  }
}

function calcTierLevel(
  visits: number,
  config: LoyaltyConfig
): number {
  if (visits >= config.tier3Visits) return 3
  if (visits >= config.tier2Visits) return 2
  if (visits >= config.tier1Visits) return 1
  return 0
}

export type ProcessAutoEarnParams = {
  customer_id: number
  amount: number
  source: 'invoice' | 'receipt'
  source_id: number
  created_by: number
  department?: 'mechanical' | 'programming'
}

function processAutoEarnImpl(params: ProcessAutoEarnParams): void {
  const config = getLoyaltyConfig()
  if (!config?.enabled) return

  if (params.source === 'invoice' &&
      !config.autoEarnInvoice) return
  if (params.source === 'receipt' &&
      !config.autoEarnReceipt) return

  const dept: 'all' | 'mechanical' | 'programming' =
    config.deptMode === 'per_dept' && params.department
      ? params.department
      : 'all'

  const pointsDelta =
    (config.type === 'points' ||
     config.type === 'all')
      ? Math.floor(params.amount *
          (Number.isFinite(config.pointsPerAed) ? config.pointsPerAed : 1))
      : 0

  const stampsDelta =
    (config.type === 'stamps' ||
     config.type === 'all')
      ? (Number.isFinite(config.stampsPerVisit) ? config.stampsPerVisit : 1)
      : 0

  loyaltyRepo.addTransaction({
    customer_id: params.customer_id,
    department: dept,
    type: pointsDelta > 0
      ? 'earn_points'
      : 'earn_stamps',
    points_delta: pointsDelta,
    stamps_delta: stampsDelta,
    visits_delta: 1,
    source: params.source,
    source_id: params.source_id,
    created_by: params.created_by,
  })
}

export const loyaltyRepo = {

  getLoyalty(
    customerId: number,
    department: 'all' | 'mechanical' | 'programming'
      = 'all'
  ): LoyaltyRow {
    const db = getDb()
    const row = db.prepare(`
      SELECT * FROM customer_loyalty
      WHERE customer_id = ? AND department = ?
    `).get(customerId, department) as
      LoyaltyRow | undefined

    return row ?? {
      id: 0,
      customer_id: customerId,
      department,
      points: 0,
      stamps: 0,
      total_visits: 0,
      tier_level: 0,
      updated_at: new Date().toISOString(),
    }
  },

  getAllDepts(customerId: number): LoyaltyRow[] {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM customer_loyalty
      WHERE customer_id = ?
      ORDER BY department
    `).all(customerId) as LoyaltyRow[]
  },

  addTransaction(tx: {
    customer_id: number
    department: 'all' | 'mechanical' | 'programming'
    type: 'earn_points' | 'earn_stamps' |
          'redeem' | 'manual_adjust'
    points_delta: number
    stamps_delta: number
    visits_delta: number
    source?: 'invoice' | 'receipt' | 'manual'
    source_id?: number
    note?: string
    created_by?: number
  }): void {
    const db = getDb()
    const config = getLoyaltyConfig()

    db.transaction(() => {
      db.prepare(`
        INSERT INTO loyalty_transactions
          (customer_id, department, type,
           points_delta, stamps_delta, visits_delta,
           source, source_id, note, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        tx.customer_id, tx.department, tx.type,
        tx.points_delta, tx.stamps_delta,
        tx.visits_delta,
        tx.source ?? null, tx.source_id ?? null,
        tx.note ?? null, tx.created_by ?? null
      )

      const existing = loyaltyRepo.getLoyalty(
        tx.customer_id, tx.department
      )

      const newPoints = Math.max(0,
        existing.points + tx.points_delta)
      const newStamps = Math.max(0,
        existing.stamps + tx.stamps_delta)
      const newVisits = Math.max(0,
        existing.total_visits + tx.visits_delta)
      const newTier = config
        ? calcTierLevel(newVisits, config)
        : existing.tier_level

      db.prepare(`
        INSERT INTO customer_loyalty
          (customer_id, department, points,
           stamps, total_visits, tier_level,
           updated_at)
        VALUES (?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(customer_id, department)
        DO UPDATE SET
          points       = excluded.points,
          stamps       = excluded.stamps,
          total_visits = excluded.total_visits,
          tier_level   = excluded.tier_level,
          updated_at   = excluded.updated_at
      `).run(
        tx.customer_id, tx.department,
        newPoints, newStamps, newVisits, newTier
      )
    })()
  },

  getTransactions(
    customerId: number,
    department?: string,
    limit = 20
  ): LoyaltyTransaction[] {
    const db = getDb()
    if (department && department !== 'all') {
      return (db.prepare(`
        SELECT * FROM loyalty_transactions
        WHERE customer_id = ? AND department = ?
        ORDER BY created_at DESC LIMIT ?
      `).all(customerId, department, limit) as LoyaltyTransaction[])
    }
    return (db.prepare(`
      SELECT * FROM loyalty_transactions
      WHERE customer_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(customerId, limit) as LoyaltyTransaction[])
  },

  processAutoEarn: processAutoEarnImpl,

  redeemReward(params: {
    customer_id: number
    department: 'all' | 'mechanical' | 'programming'
    note: string
    created_by: number
  }): void {
    const existing = loyaltyRepo.getLoyalty(
      params.customer_id, params.department
    )
    loyaltyRepo.addTransaction({
      customer_id: params.customer_id,
      department: params.department,
      type: 'redeem',
      points_delta: -existing.points,
      stamps_delta: -existing.stamps,
      visits_delta: 0,
      source: 'manual',
      note: params.note,
      created_by: params.created_by,
    })
  },
}

/** Legacy positional API for sale/custom receipt handlers (`import * as loyaltyRepo`). */
export function processAutoEarn(
  customerId: number,
  amount: number,
  source: 'invoice' | 'receipt',
  sourceId: number,
  createdBy: number
): void {
  processAutoEarnImpl({
    customer_id: customerId,
    amount,
    source,
    source_id: sourceId,
    created_by: createdBy,
  })
}
