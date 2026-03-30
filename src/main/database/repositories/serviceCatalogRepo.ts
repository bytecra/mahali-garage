import { getDb } from '../index'

export type CatalogDepartment = 'mechanical' | 'programming'

export interface ServiceCatalogFilters {
  brand_id?: number
  model?: string
  department?: CatalogDepartment
}

export interface ServiceCatalogRow {
  id: number
  brand_id: number
  model: string
  service_name: string
  department: CatalogDepartment
  price: number
  estimated_time: number | null
  active: number
  created_at: string
  brand_name: string
}

export interface ServiceCatalogInput {
  brand_id: number
  model: string
  service_name: string
  department: CatalogDepartment
  price: number
  estimated_time?: number | null
  active?: boolean
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export const serviceCatalogRepo = {
  list(filters: ServiceCatalogFilters = {}): ServiceCatalogRow[] {
    const db = getDb()
    const cond: string[] = []
    const params: unknown[] = []
    if (filters.brand_id != null) {
      cond.push('sc.brand_id = ?')
      params.push(filters.brand_id)
    }
    if (filters.model) {
      cond.push('LOWER(TRIM(sc.model)) LIKE ?')
      params.push(`%${norm(filters.model)}%`)
    }
    if (filters.department) {
      cond.push('sc.department = ?')
      params.push(filters.department)
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
    return db.prepare(`
      SELECT sc.*, cb.name AS brand_name
      FROM service_catalog sc
      JOIN car_brands cb ON cb.id = sc.brand_id
      ${where}
      ORDER BY cb.name ASC, sc.model ASC, sc.service_name ASC
    `).all(...params) as ServiceCatalogRow[]
  },

  /** Match vehicle make/model to catalog (case-insensitive). */
  forVehicleMakeModel(make: string, model: string): { mechanical: ServiceCatalogRow[]; programming: ServiceCatalogRow[] } {
    const db = getDb()
    const mk = norm(make)
    const md = norm(model)
    const rows = db.prepare(`
      SELECT sc.*, cb.name AS brand_name
      FROM service_catalog sc
      JOIN car_brands cb ON cb.id = sc.brand_id
      WHERE sc.active = 1
        AND LOWER(TRIM(cb.name)) = ?
        AND LOWER(TRIM(sc.model)) = ?
      ORDER BY sc.service_name ASC
    `).all(mk, md) as ServiceCatalogRow[]
    return {
      mechanical: rows.filter(r => r.department === 'mechanical'),
      programming: rows.filter(r => r.department === 'programming'),
    }
  },

  getById(id: number): ServiceCatalogRow | null {
    const row = getDb().prepare(`
      SELECT sc.*, cb.name AS brand_name
      FROM service_catalog sc
      JOIN car_brands cb ON cb.id = sc.brand_id
      WHERE sc.id = ?
    `).get(id) as ServiceCatalogRow | undefined
    return row ?? null
  },

  create(input: ServiceCatalogInput): number {
    const r = getDb()
      .prepare(`
        INSERT INTO service_catalog (brand_id, model, service_name, department, price, estimated_time, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.brand_id,
        input.model.trim(),
        input.service_name.trim(),
        input.department,
        input.price,
        input.estimated_time ?? null,
        input.active === false ? 0 : 1,
      )
    return r.lastInsertRowid as number
  },

  update(id: number, input: Partial<ServiceCatalogInput>): boolean {
    const db = getDb()
    const fields: string[] = []
    const vals: unknown[] = []
    if (input.brand_id !== undefined) { fields.push('brand_id = ?'); vals.push(input.brand_id) }
    if (input.model !== undefined) { fields.push('model = ?'); vals.push(input.model.trim()) }
    if (input.service_name !== undefined) { fields.push('service_name = ?'); vals.push(input.service_name.trim()) }
    if (input.department !== undefined) { fields.push('department = ?'); vals.push(input.department) }
    if (input.price !== undefined) { fields.push('price = ?'); vals.push(input.price) }
    if (input.estimated_time !== undefined) { fields.push('estimated_time = ?'); vals.push(input.estimated_time) }
    if (input.active !== undefined) { fields.push('active = ?'); vals.push(input.active ? 1 : 0) }
    if (!fields.length) return false
    vals.push(id)
    db.prepare(`UPDATE service_catalog SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return true
  },

  delete(id: number): boolean {
    getDb().prepare(`DELETE FROM service_catalog WHERE id = ?`).run(id)
    return true
  },
}
