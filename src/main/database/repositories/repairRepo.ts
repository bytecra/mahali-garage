import { getDb } from '../index'

export interface RepairFilters {
  search?: string
  status?: string
  technicianId?: number
  priority?: string
  page?: number
  pageSize?: number
}

export interface CreateRepairInput {
  type: 'repair' | 'pc_build' | 'installation' | 'other'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  customer_id?: number | null
  technician_id?: number | null
  created_by: number
  device_type?: string
  device_brand?: string
  device_model?: string
  serial_number?: string
  reported_issue: string
  diagnosis?: string
  estimated_cost?: number
  deposit_paid?: number
  estimated_date?: string
  notes?: string
}

export interface UpdateRepairInput {
  type?: string
  priority?: string
  customer_id?: number | null
  technician_id?: number | null
  device_type?: string
  device_brand?: string
  device_model?: string
  serial_number?: string
  reported_issue?: string
  diagnosis?: string
  work_done?: string
  parts_used?: string
  estimated_cost?: number
  final_cost?: number
  deposit_paid?: number
  estimated_date?: string
  notes?: string
}

export const repairRepo = {
  list(filters: RepairFilters = {}) {
    const db = getDb()
    const { search, status, technicianId, priority, page = 1, pageSize = 20 } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push(`(r.job_number LIKE ? OR c.name LIKE ? OR r.device_brand LIKE ? OR r.device_model LIKE ? OR r.reported_issue LIKE ?)`)
      const like = `%${search}%`
      params.push(like, like, like, like, like)
    }
    if (status) { conditions.push(`r.status = ?`); params.push(status) }
    if (technicianId) { conditions.push(`r.technician_id = ?`); params.push(technicianId) }
    if (priority) { conditions.push(`r.priority = ?`); params.push(priority) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt FROM repairs r
      LEFT JOIN customers c ON r.customer_id = c.id
      ${where}
    `).get(...params) as { cnt: number }).cnt

    const rows = db.prepare(`
      SELECT r.*, c.name as customer_name, u.full_name as technician_name
      FROM repairs r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.technician_id = u.id
      ${where}
      ORDER BY
        CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  getByStatus() {
    const db = getDb()
    // Returns repair cards grouped for Kanban — all active repairs
    const rows = db.prepare(`
      SELECT r.*, c.name as customer_name, u.full_name as technician_name
      FROM repairs r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.technician_id = u.id
      WHERE r.status NOT IN ('delivered', 'cancelled')
      ORDER BY
        CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        r.created_at DESC
    `).all()
    return rows
  },

  getById(id: number) {
    const db = getDb()
    const repair = db.prepare(`
      SELECT r.*, c.name as customer_name, u.full_name as technician_name, cb.full_name as created_by_name
      FROM repairs r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN users u ON r.technician_id = u.id
      LEFT JOIN users cb ON r.created_by = cb.id
      WHERE r.id = ?
    `).get(id)
    if (!repair) return null
    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name
      FROM repair_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.repair_id = ?
      ORDER BY h.created_at DESC
    `).all(id)
    return { ...(repair as object), history }
  },

  create(input: CreateRepairInput): number {
    const db = getDb()
    const nextRaw = (db.prepare(`SELECT value FROM settings WHERE key = 'repair.next_number'`).get() as { value: string } | undefined)?.value ?? '1'
    const next = parseInt(nextRaw, 10)
    const job_number = `JOB-${String(next).padStart(5, '0')}`

    const result = db.prepare(`
      INSERT INTO repairs (job_number, type, priority, customer_id, technician_id, created_by,
        device_type, device_brand, device_model, serial_number, reported_issue, diagnosis,
        estimated_cost, deposit_paid, estimated_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job_number, input.type, input.priority ?? 'normal',
      input.customer_id ?? null, input.technician_id ?? null, input.created_by,
      input.device_type ?? null, input.device_brand ?? null, input.device_model ?? null,
      input.serial_number ?? null, input.reported_issue, input.diagnosis ?? null,
      input.estimated_cost ?? 0, input.deposit_paid ?? 0, input.estimated_date ?? null, input.notes ?? null,
    )

    // Insert initial status history
    db.prepare(`INSERT INTO repair_status_history (repair_id, to_status, changed_by, notes) VALUES (?, 'received', ?, 'Created')`)
      .run(result.lastInsertRowid, input.created_by)

    // Increment counter
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'repair.next_number'`).run(String(next + 1))

    return result.lastInsertRowid as number
  },

  update(id: number, input: UpdateRepairInput): boolean {
    const db = getDb()
    const fields = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${k} = ?`)
      .join(', ')
    const values = Object.entries(input).filter(([, v]) => v !== undefined).map(([, v]) => v)
    if (!fields) return false
    db.prepare(`UPDATE repairs SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return true
  },

  updateStatus(id: number, newStatus: string, userId: number, notes?: string): boolean {
    const db = getDb()
    const txn = db.transaction(() => {
      const repair = db.prepare(`SELECT status FROM repairs WHERE id = ?`).get(id) as { status: string } | undefined
      if (!repair) throw new Error('Repair not found')

      const extras: Record<string, string> = {}
      if (newStatus === 'completed') extras['completed_at'] = "datetime('now')"
      if (newStatus === 'delivered') extras['delivered_at'] = "datetime('now')"

      const extraSql = Object.entries(extras).map(([k, v]) => `${k} = ${v}`).join(', ')
      const sep = extraSql ? ', ' : ''
      db.prepare(`UPDATE repairs SET status = ?, updated_at = datetime('now')${sep}${extraSql} WHERE id = ?`).run(newStatus, id)
      db.prepare(`INSERT INTO repair_status_history (repair_id, from_status, to_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`)
        .run(id, repair.status, newStatus, userId, notes ?? null)
    })
    txn()
    return true
  },

  delete(id: number): boolean {
    const db = getDb()
    db.prepare(`DELETE FROM repairs WHERE id = ?`).run(id)
    return true
  },
}
