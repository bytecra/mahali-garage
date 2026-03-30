import { getDb } from '../index'

export interface AssetRow {
  id: number
  name: string
  category: string
  purchase_date: string
  purchase_price: number
  current_value: number | null
  description: string | null
  notes: string | null
  created_at: string
}

export interface AssetListFilters {
  search?: string
  category?: string
  limit?: number
  offset?: number
}

export interface AssetInput {
  name: string
  category: string
  purchase_date: string
  purchase_price: number
  current_value?: number | null
  description?: string | null
  notes?: string | null
}

function assetWhere(filters: Pick<AssetListFilters, 'search' | 'category'>): { sql: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conditions.push('(name LIKE ? OR IFNULL(description, \'\') LIKE ? OR IFNULL(notes, \'\') LIKE ?)')
    params.push(q, q, q)
  }
  if (filters.category?.trim()) {
    conditions.push('category = ?')
    params.push(filters.category.trim())
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

export const assetRepo = {
  list(filters: AssetListFilters = {}): { rows: AssetRow[]; total: number } {
    const db = getDb()
    const { sql: where, params } = assetWhere(filters)
    const limit = filters.limit ?? 200
    const offset = filters.offset ?? 0
    const total = (db.prepare(`SELECT COUNT(*) as n FROM assets ${where}`).get(...params) as { n: number }).n
    const rows = db.prepare(`
      SELECT * FROM assets ${where}
      ORDER BY purchase_date DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as AssetRow[]
    return { rows, total }
  },

  /** Sum of purchase_price for rows matching search/category (no pagination). */
  filteredPurchaseSum(filters: Pick<AssetListFilters, 'search' | 'category'> = {}): number {
    try {
      const db = getDb()
      const { sql: where, params } = assetWhere(filters)
      const row = db.prepare(`SELECT COALESCE(SUM(purchase_price), 0) as s FROM assets ${where}`).get(...params) as { s: number }
      return row.s
    } catch {
      return 0
    }
  },

  distinctCategories(): string[] {
    try {
      const db = getDb()
      return (
          db.prepare(`SELECT DISTINCT category FROM assets ORDER BY category COLLATE NOCASE`).all() as { category: string }[]
        ).map(r => r.category)
    } catch {
      return []
    }
  },

  /** Sum of purchase_price (all rows). */
  totalPurchaseValue(): number {
    try {
      return (getDb().prepare(`SELECT COALESCE(SUM(purchase_price), 0) as s FROM assets`).get() as { s: number }).s
    } catch {
      return 0
    }
  },

  reportTotals(): { total_purchase: number; total_current: number } {
    try {
      return getDb().prepare(`
        SELECT
          COALESCE(SUM(purchase_price), 0) AS total_purchase,
          COALESCE(SUM(COALESCE(current_value, 0)), 0) AS total_current
        FROM assets
      `).get() as { total_purchase: number; total_current: number }
    } catch {
      return { total_purchase: 0, total_current: 0 }
    }
  },

  getById(id: number): AssetRow | null {
    try {
      return getDb().prepare(`SELECT * FROM assets WHERE id = ?`).get(id) as AssetRow | null
    } catch {
      return null
    }
  },

  create(input: AssetInput): number {
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO assets (name, category, purchase_date, purchase_price, current_value, description, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name.trim(),
      input.category.trim(),
      input.purchase_date,
      input.purchase_price,
      input.current_value ?? null,
      input.description?.trim() || null,
      input.notes?.trim() || null,
    )
    return r.lastInsertRowid as number
  },

  update(id: number, input: Partial<AssetInput>): void {
    const db = getDb()
    const row = assetRepo.getById(id)
    if (!row) throw new Error('Asset not found')
    const name = input.name !== undefined ? input.name.trim() : row.name
    const category = input.category !== undefined ? input.category.trim() : row.category
    const purchase_date = input.purchase_date ?? row.purchase_date
    const purchase_price = input.purchase_price !== undefined ? input.purchase_price : row.purchase_price
    const current_value = input.current_value !== undefined ? input.current_value : row.current_value
    const description = input.description !== undefined ? (input.description?.trim() || null) : row.description
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : row.notes
    db.prepare(`
      UPDATE assets SET name = ?, category = ?, purchase_date = ?, purchase_price = ?,
        current_value = ?, description = ?, notes = ?
      WHERE id = ?
    `).run(name, category, purchase_date, purchase_price, current_value, description, notes, id)
  },

  delete(id: number): boolean {
    const r = getDb().prepare(`DELETE FROM assets WHERE id = ?`).run(id)
    return r.changes > 0
  },
}
