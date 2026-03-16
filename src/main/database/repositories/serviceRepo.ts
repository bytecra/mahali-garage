import { getDb } from '../index'

export interface ServiceRow {
  id: number
  name: string
  description: string | null
  category: string | null
  estimated_time: number | null
  price: number
  parts_included: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface ServiceFilters {
  search?: string
  category?: string
  active_only?: boolean
  page?: number
  pageSize?: number
}

export const serviceRepo = {
  list(filters: ServiceFilters = {}): { items: ServiceRow[]; total: number } {
    const db = getDb()
    const { search = '', category, active_only = false, page = 1, pageSize = 50 } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(s.name LIKE ? OR s.description LIKE ? OR s.category LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like)
    }
    if (category) { conditions.push('s.category = ?'); params.push(category) }
    if (active_only) { conditions.push('s.is_active = 1') }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM services_catalog s ${where}`).get(...params) as { cnt: number }).cnt

    const items = db.prepare(`
      SELECT s.* FROM services_catalog s ${where}
      ORDER BY s.category, s.name
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as ServiceRow[]

    return { items, total }
  },

  getById(id: number): ServiceRow | null {
    return (getDb().prepare('SELECT * FROM services_catalog WHERE id = ?').get(id) as ServiceRow) || null
  },

  create(data: Partial<ServiceRow>): number {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO services_catalog (name, description, category, estimated_time, price, parts_included, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name ?? '', data.description ?? null, data.category ?? null,
      data.estimated_time ?? null, data.price ?? 0, data.parts_included ?? null,
      data.is_active ?? 1,
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<ServiceRow>): boolean {
    const db = getDb()
    const fields = Object.entries(data)
      .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
      .filter(([, v]) => v !== undefined)
    if (!fields.length) return false
    const sets = fields.map(([k]) => `${k} = ?`).join(', ')
    const values = fields.map(([, v]) => v)
    db.prepare(`UPDATE services_catalog SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return true
  },

  delete(id: number): boolean {
    getDb().prepare('DELETE FROM services_catalog WHERE id = ?').run(id)
    return true
  },

  getCategories(): string[] {
    const rows = getDb().prepare('SELECT DISTINCT category FROM services_catalog WHERE category IS NOT NULL ORDER BY category').all() as { category: string }[]
    return rows.map(r => r.category)
  },
}
