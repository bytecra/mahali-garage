import { getDb } from '../index'

export interface JobCardFilters {
  search?: string
  status?: string
  technician_id?: number
  vehicle_id?: number
  owner_id?: number
  page?: number
  pageSize?: number
}

export interface CreateJobCardInput {
  vehicle_id?: number | null
  owner_id?: number | null
  complaint?: string
  diagnosis?: string
  technician_id?: number | null
  bay_number?: string
  mileage_in?: number
  labor_rate?: number
  notes?: string
  created_by: number
}

export interface UpdateJobCardInput {
  vehicle_id?: number | null
  owner_id?: number | null
  status?: string
  technician_id?: number | null
  bay_number?: string
  mileage_in?: number
  mileage_out?: number
  complaint?: string
  diagnosis?: string
  work_done?: string
  labor_hours?: number
  labor_rate?: number
  notes?: string
  date_out?: string
}

export interface JobPartInput {
  product_id?: number | null
  description?: string
  quantity: number
  unit_price: number
}

export const jobCardRepo = {
  list(filters: JobCardFilters = {}) {
    const db = getDb()
    const { search, status, technician_id, vehicle_id, owner_id, page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push(`(j.job_number LIKE ? OR c.name LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR v.license_plate LIKE ?)`)
      const like = `%${search}%`
      params.push(like, like, like, like, like)
    }
    if (status) { conditions.push('j.status = ?'); params.push(status) }
    if (technician_id) { conditions.push('j.technician_id = ?'); params.push(technician_id) }
    if (vehicle_id) { conditions.push('j.vehicle_id = ?'); params.push(vehicle_id) }
    if (owner_id) { conditions.push('j.owner_id = ?'); params.push(owner_id) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      ${where}
    `).get(...params) as { cnt: number }).cnt

    const rows = db.prepare(`
      SELECT j.*, c.name as owner_name, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.license_plate as vehicle_plate
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      ${where}
      ORDER BY j.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  getByStatus() {
    const db = getDb()
    return db.prepare(`
      SELECT j.*, c.name as owner_name, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.license_plate as vehicle_plate
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      WHERE j.status NOT IN ('delivered','cancelled')
      ORDER BY j.created_at DESC
    `).all()
  },

  getById(id: number) {
    const db = getDb()
    const card = db.prepare(`
      SELECT j.*, c.name as owner_name, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.license_plate as vehicle_plate, v.vin as vehicle_vin,
        cb.full_name as created_by_name
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      LEFT JOIN users cb ON j.created_by = cb.id
      WHERE j.id = ?
    `).get(id)
    if (!card) return null

    const parts = db.prepare(`
      SELECT jp.*, p.name as product_name
      FROM job_parts jp
      LEFT JOIN products p ON jp.product_id = p.id
      WHERE jp.job_card_id = ?
    `).all(id)

    return { ...(card as object), parts }
  },

  create(input: CreateJobCardInput): { id: number; job_number: string } {
    const db = getDb()
    const nextRaw = (db.prepare(`SELECT value FROM settings WHERE key = 'job_card.next_number'`).get() as { value: string } | undefined)?.value ?? '1'
    const next = parseInt(nextRaw, 10)
    const job_number = `JC-${String(next).padStart(5, '0')}`

    const result = db.prepare(`
      INSERT INTO job_cards (job_number, vehicle_id, owner_id, complaint, diagnosis, technician_id,
        bay_number, mileage_in, labor_rate, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job_number, input.vehicle_id ?? null, input.owner_id ?? null,
      input.complaint ?? null, input.diagnosis ?? null, input.technician_id ?? null,
      input.bay_number ?? null, input.mileage_in ?? null, input.labor_rate ?? 0,
      input.notes ?? null, input.created_by,
    )

    db.prepare(`UPDATE settings SET value = ? WHERE key = 'job_card.next_number'`).run(String(next + 1))

    return { id: result.lastInsertRowid as number, job_number }
  },

  update(id: number, input: UpdateJobCardInput): boolean {
    const db = getDb()
    const fields = Object.entries(input).filter(([, v]) => v !== undefined)
    if (!fields.length) return false
    const sets = fields.map(([k]) => `${k} = ?`).join(', ')
    const values = fields.map(([, v]) => v)
    db.prepare(`UPDATE job_cards SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return true
  },

  updateStatus(id: number, status: string): boolean {
    const db = getDb()
    const extras: string[] = []
    if (status === 'delivered') extras.push("date_out = datetime('now')")
    const extraSql = extras.length ? ', ' + extras.join(', ') : ''
    db.prepare(`UPDATE job_cards SET status = ?, updated_at = datetime('now')${extraSql} WHERE id = ?`).run(status, id)
    return true
  },

  recalcTotals(id: number): void {
    const db = getDb()
    const card = db.prepare('SELECT labor_hours, labor_rate FROM job_cards WHERE id = ?').get(id) as { labor_hours: number; labor_rate: number } | undefined
    if (!card) return
    const partsTotal = (db.prepare('SELECT COALESCE(SUM(total), 0) as t FROM job_parts WHERE job_card_id = ?').get(id) as { t: number }).t
    const laborTotal = (card.labor_hours || 0) * (card.labor_rate || 0)
    const total = partsTotal + laborTotal
    db.prepare('UPDATE job_cards SET parts_total = ?, labor_total = ?, total = ?, updated_at = datetime(\'now\') WHERE id = ?').run(partsTotal, laborTotal, total, id)
  },

  addPart(jobCardId: number, part: JobPartInput): number {
    const db = getDb()
    const total = part.quantity * part.unit_price
    const result = db.prepare(`
      INSERT INTO job_parts (job_card_id, product_id, description, quantity, unit_price, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobCardId, part.product_id ?? null, part.description ?? null, part.quantity, part.unit_price, total)
    this.recalcTotals(jobCardId)
    return result.lastInsertRowid as number
  },

  removePart(partId: number): boolean {
    const db = getDb()
    const part = db.prepare('SELECT job_card_id FROM job_parts WHERE id = ?').get(partId) as { job_card_id: number } | undefined
    if (!part) return false
    db.prepare('DELETE FROM job_parts WHERE id = ?').run(partId)
    this.recalcTotals(part.job_card_id)
    return true
  },

  delete(id: number): boolean {
    getDb().prepare('DELETE FROM job_cards WHERE id = ?').run(id)
    return true
  },

  getForVehicle(vehicleId: number) {
    return getDb().prepare(`
      SELECT j.*, u.full_name as technician_name
      FROM job_cards j
      LEFT JOIN users u ON j.technician_id = u.id
      WHERE j.vehicle_id = ?
      ORDER BY j.created_at DESC
      LIMIT 50
    `).all(vehicleId)
  },
}
