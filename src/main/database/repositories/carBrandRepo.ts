import { getDb } from '../index'

export interface CarBrandRow {
  id: number
  name: string
  logo: string | null
  created_at: string
}

export interface CarBrandInput {
  name: string
  logo?: string | null
}

export const carBrandRepo = {
  list(): CarBrandRow[] {
    return getDb()
      .prepare(`SELECT * FROM car_brands ORDER BY name ASC`)
      .all() as CarBrandRow[]
  },

  getById(id: number): CarBrandRow | null {
    const row = getDb().prepare(`SELECT * FROM car_brands WHERE id = ?`).get(id) as CarBrandRow | undefined
    return row ?? null
  },

  create(input: CarBrandInput): number {
    const r = getDb()
      .prepare(`INSERT INTO car_brands (name, logo) VALUES (?, ?)`)
      .run(input.name.trim(), input.logo ?? null)
    return r.lastInsertRowid as number
  },

  update(id: number, input: Partial<CarBrandInput>): boolean {
    const fields: string[] = []
    const vals: unknown[] = []
    if (input.name !== undefined) {
      fields.push('name = ?')
      vals.push(input.name.trim())
    }
    if (input.logo !== undefined) {
      fields.push('logo = ?')
      vals.push(input.logo)
    }
    if (!fields.length) return false
    vals.push(id)
    getDb().prepare(`UPDATE car_brands SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    return true
  },

  delete(id: number): boolean {
    getDb().prepare(`DELETE FROM car_brands WHERE id = ?`).run(id)
    return true
  },
}
