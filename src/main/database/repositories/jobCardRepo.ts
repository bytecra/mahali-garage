import { getDb } from '../index'

export type JobDepartment = 'mechanical' | 'programming' | 'both'

function normalizeDepartment(v: unknown): JobDepartment {
  if (v === 'programming' || v === 'both' || v === 'mechanical') return v
  return 'mechanical'
}

export interface JobCardFilters {
  search?: string
  status?: string
  /** Narrow board/list to jobs that include this department (includes `both` with either filter). */
  department?: 'mechanical' | 'programming'
  technician_id?: number
  vehicle_id?: number
  owner_id?: number
  bay_number?: string
  page?: number
  pageSize?: number
}

export interface CreateJobCardInput {
  vehicle_id?: number | null
  owner_id?: number | null
  job_type?: string
  priority?: string
  status?: string
  complaint?: string
  diagnosis?: string
  technician_id?: number | null
  bay_number?: string
  mileage_in?: number
  labor_rate?: number
  expected_completion?: string
  deposit?: number
  tax_rate?: number
  notes?: string
  customer_authorized?: number
  department?: JobDepartment
  created_by: number
}

export interface UpdateJobCardInput {
  vehicle_id?: number | null
  owner_id?: number | null
  job_type?: string
  priority?: string
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
  expected_completion?: string
  deposit?: number
  tax_rate?: number
  notes?: string
  customer_authorized?: number
  date_out?: string
  department?: JobDepartment
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
    const { search, status, department, technician_id, vehicle_id, owner_id, bay_number, page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push(`(j.job_number LIKE ? OR c.name LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR v.license_plate LIKE ? OR j.complaint LIKE ?)`)
      const like = `%${search}%`
      params.push(like, like, like, like, like, like)
    }
    if (status) { conditions.push('j.status = ?'); params.push(status) }
    if (department === 'mechanical') {
      conditions.push(`j.department IN ('mechanical','both')`)
    } else if (department === 'programming') {
      conditions.push(`j.department IN ('programming','both')`)
    }
    if (technician_id) { conditions.push('j.technician_id = ?'); params.push(technician_id) }
    if (vehicle_id) { conditions.push('j.vehicle_id = ?'); params.push(vehicle_id) }
    if (owner_id) { conditions.push('j.owner_id = ?'); params.push(owner_id) }
    if (bay_number) { conditions.push('j.bay_number = ?'); params.push(bay_number) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      ${where}
    `).get(...params) as { cnt: number }).cnt

    const rows = db.prepare(`
      SELECT j.*, c.name as owner_name, c.phone as owner_phone, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
        v.license_plate as vehicle_plate, v.vin as vehicle_vin
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      ${where}
      ORDER BY
        CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        j.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  getByStatus() {
    const db = getDb()
    return db.prepare(`
      SELECT j.*, c.name as owner_name, c.phone as owner_phone, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
        v.license_plate as vehicle_plate
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      WHERE j.status NOT IN ('delivered','cancelled')
      ORDER BY
        CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        j.created_at DESC
    `).all()
  },

  getById(id: number) {
    const db = getDb()
    const card = db.prepare(`
      SELECT j.*, c.name as owner_name, c.phone as owner_phone, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
        v.license_plate as vehicle_plate, v.vin as vehicle_vin, v.mileage as vehicle_mileage,
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
    const year = new Date().getFullYear()
    const nextRaw = (db.prepare(`SELECT value FROM settings WHERE key = 'job_card.next_number'`).get() as { value: string } | undefined)?.value ?? '1'
    const next = parseInt(nextRaw, 10)
    const job_number = `JOB-${year}-${String(next).padStart(4, '0')}`

    const deposit = input.deposit ?? 0
    const taxRate = input.tax_rate ?? 0
    const dept = normalizeDepartment(input.department)

    const result = db.prepare(`
      INSERT INTO job_cards (job_number, vehicle_id, owner_id, job_type, priority, status, complaint, diagnosis,
        technician_id, bay_number, mileage_in, labor_rate, expected_completion, deposit, tax_rate,
        notes, customer_authorized, department, created_by, balance_due)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job_number,
      input.vehicle_id ?? null,
      input.owner_id ?? null,
      input.job_type ?? 'General Service',
      input.priority ?? 'normal',
      input.status ?? 'pending',
      input.complaint ?? null,
      input.diagnosis ?? null,
      input.technician_id ?? null,
      input.bay_number ?? null,
      input.mileage_in ?? null,
      input.labor_rate ?? 85,
      input.expected_completion ?? null,
      deposit,
      taxRate,
      input.notes ?? null,
      input.customer_authorized ?? 0,
      dept,
      input.created_by,
      -deposit,
    )

    db.prepare(`UPDATE settings SET value = ? WHERE key = 'job_card.next_number'`).run(String(next + 1))

    return { id: result.lastInsertRowid as number, job_number }
  },

  update(id: number, input: UpdateJobCardInput): boolean {
    const db = getDb()
    const normalized: Record<string, unknown> = { ...input }
    if (input.department !== undefined) normalized.department = normalizeDepartment(input.department)
    const fields = Object.entries(normalized).filter(([, v]) => v !== undefined)
    if (!fields.length) return false
    const sets = fields.map(([k]) => `${k} = ?`).join(', ')
    const values = fields.map(([, v]) => v)
    db.prepare(`UPDATE job_cards SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    this.recalcTotals(id)
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
    const card = db.prepare('SELECT labor_hours, labor_rate, tax_rate, deposit FROM job_cards WHERE id = ?').get(id) as {
      labor_hours: number; labor_rate: number; tax_rate: number; deposit: number
    } | undefined
    if (!card) return
    const partsTotal = (db.prepare('SELECT COALESCE(SUM(total), 0) as t FROM job_parts WHERE job_card_id = ?').get(id) as { t: number }).t
    const laborTotal = (card.labor_hours || 0) * (card.labor_rate || 0)
    const subtotal = partsTotal + laborTotal
    const taxAmount = subtotal * ((card.tax_rate || 0) / 100)
    const total = subtotal + taxAmount
    const balanceDue = total - (card.deposit || 0)
    db.prepare(`
      UPDATE job_cards SET parts_total = ?, labor_total = ?, subtotal = ?,
        tax_amount = ?, total = ?, balance_due = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(partsTotal, laborTotal, subtotal, taxAmount, total, balanceDue, id)
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
