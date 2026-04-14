import { getDb } from '../index'

/** Job card / receipt integration uses mechanical + programming; catalog can store more. */
export type CatalogDepartment =
  | 'mechanical'
  | 'programming'
  | 'electrical'
  | 'painting'
  | 'other'

export interface ServiceCatalogFilters {
  search?: string
  department?: string
  category?: string
  active_only?: boolean
  include_inactive?: boolean
  page?: number
  pageSize?: number
  sort_by?: 'name' | 'price'
  sort_dir?: 'asc' | 'desc'
}

export interface ServiceCatalogRow {
  id: number
  service_name: string
  description: string | null
  default_price: number
  department: string
  category: string | null
  estimated_time: number | null
  active: number
  created_at: string
  created_by: number | null
  /** Alias for legacy UI (same as default_price). */
  price: number
}

export interface ServiceCatalogInput {
  service_name: string
  description?: string | null
  default_price: number
  department: string
  category?: string | null
  estimated_time?: number | null
  active?: boolean
  created_by?: number | null
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function rowWithPrice(r: Record<string, unknown>): ServiceCatalogRow {
  const defaultPrice = Number(r.default_price ?? r.price ?? 0) || 0
  return {
    id: r.id as number,
    service_name: String(r.service_name ?? ''),
    description: r.description != null ? String(r.description) : null,
    default_price: defaultPrice,
    department: String(r.department ?? 'mechanical'),
    category: r.category != null ? String(r.category) : null,
    estimated_time: r.estimated_time != null ? Number(r.estimated_time) : null,
    active: Number(r.active ?? 1),
    created_at: String(r.created_at ?? ''),
    created_by: r.created_by != null ? Number(r.created_by) : null,
    price: defaultPrice,
  }
}

export const serviceCatalogRepo = {
  list(filters: ServiceCatalogFilters = {}): { items: ServiceCatalogRow[]; total: number } {
    const db = getDb()
    const {
      search = '',
      department,
      category,
      active_only = true,
      include_inactive = false,
      page = 1,
      pageSize = 50,
      sort_by = 'name',
      sort_dir = 'asc',
    } = filters
    const offset = (page - 1) * pageSize
    const cond: string[] = []
    const params: unknown[] = []

    if (search.trim()) {
      cond.push('(LOWER(TRIM(sc.service_name)) LIKE ? OR (sc.description IS NOT NULL AND LOWER(sc.description) LIKE ?))')
      const like = `%${norm(search)}%`
      params.push(like, like)
    }
    if (department) {
      cond.push('sc.department = ?')
      params.push(department)
    }
    if (category) {
      cond.push('sc.category = ?')
      params.push(category)
    }
    if (active_only && !include_inactive) {
      cond.push('sc.active = 1')
    }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM service_catalog sc ${where}`).get(...params) as { cnt: number }
    ).cnt

    const orderCol = sort_by === 'price' ? 'sc.default_price' : 'LOWER(sc.service_name)'
    const orderDir = sort_dir === 'desc' ? 'DESC' : 'ASC'

    const rows = db
      .prepare(
        `
      SELECT sc.* FROM service_catalog sc
      ${where}
      ORDER BY ${orderCol} ${orderDir}, sc.id ASC
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]

    return { items: rows.map(r => rowWithPrice(r)), total }
  },

  search(query: string, limit = 30): ServiceCatalogRow[] {
    const q = norm(query)
    if (!q) return []
    const db = getDb()
    const like = `%${q}%`
    const rows = db
      .prepare(
        `
      SELECT * FROM service_catalog
      WHERE active = 1 AND (
        LOWER(TRIM(service_name)) LIKE ? OR (description IS NOT NULL AND LOWER(description) LIKE ?)
      )
      ORDER BY LOWER(service_name) ASC
      LIMIT ?
    `,
      )
      .all(like, like, limit) as Record<string, unknown>[]
    return rows.map(r => rowWithPrice(r))
  },

  /** Legacy IPC: split catalog for job vs programming department. */
  forVehicleMakeModel(_make: string, _model: string): { mechanical: ServiceCatalogRow[]; programming: ServiceCatalogRow[] } {
    const { items } = this.list({ active_only: true, page: 1, pageSize: 5000, sort_by: 'name', sort_dir: 'asc' })
    return {
      mechanical: items.filter(r => r.department !== 'programming'),
      programming: items.filter(r => r.department === 'programming'),
    }
  },

  getById(id: number): ServiceCatalogRow | null {
    const r = getDb().prepare(`SELECT * FROM service_catalog WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    return r ? rowWithPrice(r) : null
  },

  findDuplicateName(serviceName: string, department: string, excludeId?: number): boolean {
    const db = getDb()
    const sql = excludeId
      ? `SELECT 1 FROM service_catalog WHERE LOWER(TRIM(service_name)) = ? AND department = ? AND id != ? LIMIT 1`
      : `SELECT 1 FROM service_catalog WHERE LOWER(TRIM(service_name)) = ? AND department = ? LIMIT 1`
    const args = excludeId
      ? [norm(serviceName), department, excludeId]
      : [norm(serviceName), department]
    return !!db.prepare(sql).get(...args)
  },

  create(input: ServiceCatalogInput): number {
    if (this.findDuplicateName(input.service_name, input.department)) {
      throw new Error('SERVICE_NAME_DUPLICATE')
    }
    const r = getDb()
      .prepare(
        `
        INSERT INTO service_catalog (service_name, description, default_price, department, category, estimated_time, active, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.service_name.trim(),
        input.description?.trim() ?? null,
        input.default_price,
        input.department,
        input.category?.trim() ?? null,
        input.estimated_time ?? null,
        input.active === false ? 0 : 1,
        input.created_by ?? null,
      )
    return r.lastInsertRowid as number
  },

  update(id: number, input: Partial<Omit<ServiceCatalogInput, 'service_name'>> & { service_name?: never }): boolean {
    const db = getDb()
    const fields: string[] = []
    const vals: unknown[] = []
    if (input.description !== undefined) {
      fields.push('description = ?')
      vals.push(input.description?.trim() ?? null)
    }
    if (input.default_price !== undefined) {
      fields.push('default_price = ?')
      vals.push(input.default_price)
    }
    if (input.department !== undefined) {
      fields.push('department = ?')
      vals.push(input.department)
    }
    if (input.category !== undefined) {
      fields.push('category = ?')
      vals.push(input.category?.trim() ?? null)
    }
    if (input.estimated_time !== undefined) {
      fields.push('estimated_time = ?')
      vals.push(input.estimated_time)
    }
    if (input.active !== undefined) {
      fields.push('active = ?')
      vals.push(input.active ? 1 : 0)
    }
    if (!fields.length) return false
    vals.push(id)
    db.prepare(`UPDATE service_catalog SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return true
  },

  /** Soft delete (deactivate). */
  softDelete(id: number): boolean {
    getDb().prepare(`UPDATE service_catalog SET active = 0 WHERE id = ?`).run(id)
    return true
  },

  /** Hard remove (admin / tests). */
  delete(id: number): boolean {
    getDb().prepare(`DELETE FROM service_catalog WHERE id = ?`).run(id)
    return true
  },

  distinctCategories(): string[] {
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT category FROM service_catalog WHERE category IS NOT NULL AND TRIM(category) != '' ORDER BY category`,
      )
      .all() as { category: string }[]
    return rows.map(r => r.category)
  },

  distinctDepartments(): string[] {
    const rows = getDb()
      .prepare(`SELECT DISTINCT department FROM service_catalog ORDER BY department`)
      .all() as { department: string }[]
    return rows.map(r => r.department)
  },
}
