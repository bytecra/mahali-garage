import { getDb } from '../index'

/** Job shop attribution: mechanical-only, programming-only, or both teams involved. */
export type JobDepartment = 'mechanical' | 'programming' | 'both'

function normalizeDepartment(v: unknown): JobDepartment {
  if (v === 'programming') return 'programming'
  if (v === 'both') return 'both'
  return 'mechanical'
}

function settingVal(db: ReturnType<typeof getDb>, key: string, fallback = ''): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

/** Next unique job number from settings (prefix / year / padding / yearly reset). */
function allocJobNumber(db: ReturnType<typeof getDb>): string {
  const year = new Date().getFullYear()
  const mode = settingVal(db, 'job_card.number.mode', 'standard')
  const yearlyReset = settingVal(db, 'job_card.number.yearly_reset', '1') === '1'
  const padN = Math.min(12, Math.max(1, parseInt(settingVal(db, 'job_card.number.padding', '4'), 10) || 4))

  let next = parseInt(settingVal(db, 'job_card.next_number', '1'), 10) || 1
  const storedYearStr = settingVal(db, 'job_card.next_number_year', '').trim()

  if (yearlyReset && storedYearStr !== '') {
    const y = parseInt(storedYearStr, 10)
    if (Number.isFinite(y) && y !== year) {
      next = 1
    }
  }

  const seq = String(next).padStart(padN, '0')

  const bump = () => {
    db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'job_card.next_number'`).run(String(next + 1))
    db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('job_card.next_number_year', ?, datetime('now'))`).run(String(year))
  }

  if (mode === 'numeric') {
    bump()
    return seq
  }

  let prefix = settingVal(db, 'job_card.number.prefix', 'JOB').trim()
  if (!prefix) prefix = 'JOB'
  prefix = prefix.replace(/-+$/, '')
  const includeYear = settingVal(db, 'job_card.number.include_year', '1') === '1'
  const job_number = includeYear ? `${prefix}-${year}-${seq}` : `${prefix}-${seq}`
  bump()
  return job_number
}

export interface JobCardFilters {
  search?: string
  status?: string
  /** Narrow board/list to jobs for this department only. */
  department?: 'mechanical' | 'programming' | 'both'
  /** Profile filled in (1) vs quick intake (0). */
  profile?: 'all' | 'complete' | 'incomplete'
  technician_id?: number
  vehicle_id?: number
  owner_id?: number
  bay_number?: string
  page?: number
  pageSize?: number
  /** Default false — archived jobs are hidden from the job list. */
  includeArchived?: boolean
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
  /** 1 = full details expected; 0 = quick-created intake. */
  profile_complete?: number
  /** JSON: `{ markers, notes }` for car diagram (same shape as custom receipts). */
  inspection_data?: string | null
  /** Preferred settlement: Cash, Card, Bank Transfer, etc. */
  payment_method?: string | null
  invoice_discount_type?: 'percentage' | 'fixed' | null
  invoice_discount_value?: number
  invoice_payment_terms?: string | null
  /** Default “show diagram on job invoice” before an invoice exists. */
  invoice_include_inspection?: number
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
  profile_complete?: number
  inspection_data?: string | null
  /** 1 = default “show diagram on invoice” before a job invoice exists (copied to job_invoices on first create). */
  invoice_include_inspection?: number
  payment_method?: string | null
  invoice_discount_type?: 'percentage' | 'fixed' | null
  invoice_discount_value?: number
  invoice_payment_terms?: string | null
  /** 1 = hidden from active boards/lists; use for finished jobs. */
  archived?: number
}

export interface JobPartInput {
  product_id?: number | null
  description?: string
  quantity: number
  /** Customer sell price per unit (maps to job_parts.unit_price). */
  unit_price: number
  /** Internal cost per unit (optional; maps to job_parts.cost_price). */
  cost_price?: number | null
  /** Unified catalog row (optional). */
  service_catalog_id?: number | null
  /** Snapshot of catalog default_price when line was built (optional). */
  default_unit_price?: number | null
  /** Line attribution: mechanical vs programming work (maps to job_parts.line_department). */
  line_department?: 'mechanical' | 'programming'
}

export const jobCardRepo = {
  list(filters: JobCardFilters = {}) {
    const db = getDb()
    const {
      search,
      status,
      department,
      profile = 'all',
      technician_id,
      vehicle_id,
      owner_id,
      bay_number,
      page = 1,
      pageSize = 25,
      includeArchived = false,
    } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      const like = `%${search}%`
      conditions.push(`(
        j.job_number LIKE ?
        OR IFNULL(c.name, '') LIKE ?
        OR IFNULL(c.phone, '') LIKE ?
        OR IFNULL(v.make, '') LIKE ?
        OR IFNULL(v.model, '') LIKE ?
        OR IFNULL(v.license_plate, '') LIKE ?
        OR IFNULL(v.vin, '') LIKE ?
        OR IFNULL(j.complaint, '') LIKE ?
        OR EXISTS (
          SELECT 1 FROM job_invoices ji_s
          WHERE ji_s.job_card_id = j.id AND IFNULL(ji_s.invoice_number, '') LIKE ?
        )
      )`)
      params.push(like, like, like, like, like, like, like, like, like)
    }
    if (status) { conditions.push('j.status = ?'); params.push(status) }
    if (department === 'mechanical') {
      conditions.push(`COALESCE(j.department, 'mechanical') IN ('mechanical','both')`)
    } else if (department === 'programming') {
      conditions.push(`j.department IN ('programming','both')`)
    } else if (department === 'both') {
      conditions.push(`j.department = 'both'`)
    }
    if (technician_id) { conditions.push('j.technician_id = ?'); params.push(technician_id) }
    if (vehicle_id) { conditions.push('j.vehicle_id = ?'); params.push(vehicle_id) }
    if (owner_id) { conditions.push('j.owner_id = ?'); params.push(owner_id) }
    if (bay_number) { conditions.push('j.bay_number = ?'); params.push(bay_number) }
    if (profile === 'incomplete') {
      conditions.push('COALESCE(j.profile_complete, 1) = 0')
    } else if (profile === 'complete') {
      conditions.push('COALESCE(j.profile_complete, 1) = 1')
    }
    if (!includeArchived) {
      conditions.push('COALESCE(j.archived, 0) = 0')
    }

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
        v.license_plate as vehicle_plate, v.vin as vehicle_vin,
        ji.invoice_number AS job_invoice_number, ji.status AS job_invoice_status
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      LEFT JOIN job_invoices ji ON ji.job_card_id = j.id
      ${where}
      ORDER BY
        CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        j.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  getByStatus(filters: { profile?: 'all' | 'complete' | 'incomplete' } = {}) {
    const db = getDb()
    const { profile = 'all' } = filters
    const profileSql =
      profile === 'incomplete'
        ? 'AND COALESCE(j.profile_complete, 1) = 0'
        : profile === 'complete'
          ? 'AND COALESCE(j.profile_complete, 1) = 1'
          : ''
    return db.prepare(`
      SELECT j.*, c.name as owner_name, c.phone as owner_phone, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
        v.license_plate as vehicle_plate,
        ji.invoice_number AS job_invoice_number, ji.status AS job_invoice_status
      FROM job_cards j
      LEFT JOIN customers c ON j.owner_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      LEFT JOIN vehicles v ON j.vehicle_id = v.id
      LEFT JOIN job_invoices ji ON ji.job_card_id = j.id
      WHERE j.status NOT IN ('delivered','cancelled')
      AND COALESCE(j.archived, 0) = 0
      ${profileSql}
      ORDER BY
        CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        j.created_at DESC
    `).all()
    // Note: 'delivered' (legacy) is excluded from the board; 'completed_delivered' (new) IS included.
    // 'waiting_for_programming' is also included via the catch-all NOT IN list above.
  },

  getById(id: number) {
    const db = getDb()
    const card = db.prepare(`
      SELECT j.*, c.name as owner_name, c.phone as owner_phone, u.full_name as technician_name,
        v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
        v.license_plate as vehicle_plate, v.vin as vehicle_vin, v.mileage as vehicle_mileage,
        v.color as vehicle_color,
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
    `).all(id) as Record<string, unknown>[]
    for (const p of parts) {
      if (p.cost_price === undefined) p.cost_price = null
      if (p.service_catalog_id === undefined) p.service_catalog_id = null
      if (p.default_unit_price === undefined) p.default_unit_price = null
      if (p.line_department === undefined || p.line_department === null) p.line_department = 'mechanical'
    }

    return { ...(card as object), parts }
  },

  create(input: CreateJobCardInput): { id: number; job_number: string } {
    const db = getDb()
    if (input.vehicle_id != null && input.owner_id != null) {
      const v = db.prepare(`SELECT owner_id FROM vehicles WHERE id = ?`).get(input.vehicle_id) as
        | { owner_id: number | null }
        | undefined
      if (!v || v.owner_id !== input.owner_id) {
        throw new Error('Vehicle does not belong to the selected customer')
      }
    }
    const job_number = allocJobNumber(db)

    const deposit = input.deposit ?? 0
    const taxRate = input.tax_rate ?? 0
    const dept = normalizeDepartment(input.department)
    const profileComplete = input.profile_complete !== undefined ? (input.profile_complete ? 1 : 0) : 1

    const discType =
      input.invoice_discount_type === 'percentage' || input.invoice_discount_type === 'fixed'
        ? input.invoice_discount_type
        : null
    const discVal = input.invoice_discount_value ?? 0

    const invInsp = Number(input.invoice_include_inspection) ? 1 : 0

    const result = db.prepare(`
      INSERT INTO job_cards (job_number, vehicle_id, owner_id, job_type, priority, status, complaint, diagnosis,
        technician_id, bay_number, mileage_in, labor_rate, expected_completion, deposit, tax_rate,
        notes, customer_authorized, department, created_by, profile_complete,
        inspection_data, payment_method, invoice_discount_type, invoice_discount_value, invoice_payment_terms,
        invoice_include_inspection,
        balance_due)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      profileComplete,
      input.inspection_data ?? null,
      input.payment_method ?? null,
      discType,
      discVal,
      input.invoice_payment_terms ?? null,
      invInsp,
      -deposit,
    )

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
    if (status === 'delivered' || status === 'completed_delivered') extras.push("date_out = datetime('now')")
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
    const costPrice = part.cost_price != null && Number.isFinite(part.cost_price) ? part.cost_price : null
    const svcId = part.service_catalog_id != null && Number.isFinite(part.service_catalog_id) ? part.service_catalog_id : null
    const defUnit =
      part.default_unit_price != null && Number.isFinite(part.default_unit_price) ? part.default_unit_price : null
    const lineDept = part.line_department === 'programming' ? 'programming' : 'mechanical'
    const result = db.prepare(`
      INSERT INTO job_parts (job_card_id, product_id, description, quantity, unit_price, total, cost_price, service_catalog_id, default_unit_price, line_department)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobCardId,
      part.product_id ?? null,
      part.description ?? null,
      part.quantity,
      part.unit_price,
      total,
      costPrice,
      svcId,
      defUnit,
      lineDept,
    )
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

  /** Job card rows for vehicle history (invoice-style list). */
  getForVehicle(vehicleId: number) {
    return getDb().prepare(`
      SELECT
        j.id,
        j.job_number,
        j.created_at,
        j.date_in,
        COALESCE(j.archived, 0) AS archived,
        'mechanical' AS department,
        j.status,
        j.total,
        j.balance_due,
        j.deposit,
        j.job_type,
        j.work_done,
        j.complaint,
        j.diagnosis,
        u.full_name AS technician_name,
        (SELECT GROUP_CONCAT(TRIM(jp.description), ', ')
         FROM job_parts jp
         WHERE jp.job_card_id = j.id AND jp.description IS NOT NULL AND TRIM(jp.description) != ''
        ) AS parts_summary
      FROM job_cards j
      LEFT JOIN users u ON j.technician_id = u.id
      WHERE j.vehicle_id = ?
      ORDER BY j.created_at DESC
      LIMIT 100
    `).all(vehicleId)
  },
}
