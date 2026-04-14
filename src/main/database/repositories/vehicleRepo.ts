import { getDb } from '../index'

export interface VehicleRow {
  id: number
  owner_id: number | null
  make: string
  model: string
  year: number | null
  vin: string | null
  license_plate: string | null
  color: string | null
  mileage: number
  engine_type: string | null
  transmission: string | null
  insurance_company: string | null
  insurance_policy: string | null
  insurance_expiry: string | null
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
  owner_name?: string
}

export interface VehicleFilters {
  search?: string
  owner_id?: number
  page?: number
  pageSize?: number
}

/** Empty optional strings → null (avoids UNIQUE(vin) collisions on repeated ''). */
function normalizeVehicleStrings(data: Partial<VehicleRow>): Partial<VehicleRow> {
  const keys: (keyof VehicleRow)[] = [
    'vin',
    'license_plate',
    'color',
    'engine_type',
    'transmission',
    'insurance_company',
    'insurance_policy',
    'insurance_expiry',
    'notes',
    'photo_url',
  ]
  const out: Partial<VehicleRow> = { ...data }
  for (const k of keys) {
    const v = out[k]
    if (typeof v === 'string' && v.trim() === '') {
      ;(out as Record<string, unknown>)[k] = null
    }
  }
  return out
}

export const vehicleRepo = {
  list(filters: VehicleFilters = {}): { items: VehicleRow[]; total: number } {
    const db = getDb()
    const { search = '', owner_id, page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(v.make LIKE ? OR v.model LIKE ? OR v.license_plate LIKE ? OR v.vin LIKE ? OR c.name LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like, like, like)
    }
    if (owner_id) {
      conditions.push('v.owner_id = ?')
      params.push(owner_id)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM vehicles v LEFT JOIN customers c ON v.owner_id = c.id ${where}`).get(...params) as { cnt: number }).cnt

    const items = db.prepare(`
      SELECT v.*, c.name as owner_name
      FROM vehicles v
      LEFT JOIN customers c ON v.owner_id = c.id
      ${where}
      ORDER BY v.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as VehicleRow[]

    return { items, total }
  },

  getById(id: number): VehicleRow | null {
    const db = getDb()
    return (db.prepare(`
      SELECT v.*, c.name as owner_name
      FROM vehicles v
      LEFT JOIN customers c ON v.owner_id = c.id
      WHERE v.id = ?
    `).get(id) as VehicleRow) || null
  },

  create(data: Partial<VehicleRow>): number {
    const db = getDb()
    const d = normalizeVehicleStrings(data)
    const result = db.prepare(`
      INSERT INTO vehicles (owner_id, make, model, year, vin, license_plate, color, mileage,
        engine_type, transmission, insurance_company, insurance_policy, insurance_expiry, notes, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.owner_id ?? null, d.make ?? '', d.model ?? '', d.year ?? null,
      d.vin ?? null, d.license_plate ?? null, d.color ?? null, d.mileage ?? 0,
      d.engine_type ?? null, d.transmission ?? null,
      d.insurance_company ?? null, d.insurance_policy ?? null, d.insurance_expiry ?? null,
      d.notes ?? null, d.photo_url ?? null,
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<VehicleRow>): boolean {
    const db = getDb()
    const fields = Object.entries(normalizeVehicleStrings(data))
      .filter(([k]) => !['id', 'created_at', 'updated_at', 'owner_name'].includes(k))
      .filter(([, v]) => v !== undefined)
    if (!fields.length) return false
    const sets = fields.map(([k]) => `${k} = ?`).join(', ')
    const values = fields.map(([, v]) => v)
    db.prepare(`UPDATE vehicles SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return true
  },

  delete(id: number): boolean {
    getDb().prepare('DELETE FROM vehicles WHERE id = ?').run(id)
    return true
  },

  /** Vehicles for a customer (owner). */
  getByOwner(ownerId: number): VehicleRow[] {
    return getDb().prepare(`
      SELECT v.*, c.name as owner_name
      FROM vehicles v
      LEFT JOIN customers c ON v.owner_id = c.id
      WHERE v.owner_id = ?
      ORDER BY v.updated_at DESC
    `).all(ownerId) as VehicleRow[]
  },

  /** Alias for clarity in customer-profile flows. */
  listForCustomer(customerId: number): VehicleRow[] {
    return this.getByOwner(customerId)
  },
}
