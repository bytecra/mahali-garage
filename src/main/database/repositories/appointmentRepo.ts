import { getDb } from '../index'

export interface AppointmentRow {
  id: number
  customer_id: number | null
  customer_name: string
  customer_phone: string | null
  vehicle_id: number | null
  car_company: string | null
  car_model: string | null
  car_year: string | null
  plate_number: string | null
  department: string
  service_notes: string | null
  technician_id: number | null
  technician_name: string | null
  appointment_date: string
  appointment_time: string
  duration_minutes: number
  status: string
  job_card_id: number | null
  created_by: number | null
  created_at: string
}

export interface AppointmentCreateInput {
  customer_id?: number
  customer_name: string
  customer_phone?: string
  vehicle_id?: number
  car_company?: string
  car_model?: string
  car_year?: string
  plate_number?: string
  department: string
  service_notes?: string
  technician_id?: number
  appointment_date: string
  appointment_time: string
  duration_minutes?: number
  created_by: number
}

export interface AppointmentListParams {
  from: string
  to: string
  department?: string
  status?: string
}

const rowSelect = `
  a.id,
  a.customer_id,
  a.customer_name,
  a.customer_phone,
  a.vehicle_id,
  a.car_company,
  a.car_model,
  a.car_year,
  a.plate_number,
  a.department,
  a.service_notes,
  a.technician_id,
  e.full_name AS technician_name,
  a.appointment_date,
  a.appointment_time,
  a.duration_minutes,
  a.status,
  a.job_card_id,
  a.created_by,
  a.created_at
`

export const appointmentRepo = {
  create(data: AppointmentCreateInput): { id: number } {
    const db = getDb()
    const duration = data.duration_minutes ?? 60
    const result = db
      .prepare(
        `
      INSERT INTO appointments (
        customer_id, customer_name, customer_phone,
        vehicle_id, car_company, car_model, car_year, plate_number,
        department, service_notes, technician_id,
        appointment_date, appointment_time, duration_minutes,
        status, created_by
      )
      VALUES (
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        'scheduled', ?
      )
    `,
      )
      .run(
        data.customer_id ?? null,
        data.customer_name,
        data.customer_phone ?? null,
        data.vehicle_id ?? null,
        data.car_company ?? null,
        data.car_model ?? null,
        data.car_year ?? null,
        data.plate_number ?? null,
        data.department,
        data.service_notes ?? null,
        data.technician_id ?? null,
        data.appointment_date,
        data.appointment_time,
        duration,
        data.created_by,
      )
    return { id: result.lastInsertRowid as number }
  },

  list(params: AppointmentListParams): AppointmentRow[] {
    const db = getDb()
    const fromD = params.from.slice(0, 10)
    const toD = params.to.slice(0, 10)
    const conditions = [`date(a.appointment_date) >= date(?)`, `date(a.appointment_date) <= date(?)`]
    const bind: (string | number)[] = [fromD, toD]
    if (params.department) {
      conditions.push('a.department = ?')
      bind.push(params.department)
    }
    if (params.status) {
      conditions.push('a.status = ?')
      bind.push(params.status)
    }
    const where = conditions.join(' AND ')
    return db
      .prepare(
        `
      SELECT ${rowSelect}
      FROM appointments a
      LEFT JOIN employees e ON e.id = a.technician_id
      LEFT JOIN customers c ON c.id = a.customer_id
      WHERE ${where}
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `,
      )
      .all(...bind) as AppointmentRow[]
  },

  getById(id: number): AppointmentRow | null {
    const db = getDb()
    const row = db
      .prepare(
        `
      SELECT ${rowSelect}
      FROM appointments a
      LEFT JOIN employees e ON e.id = a.technician_id
      LEFT JOIN customers c ON c.id = a.customer_id
      WHERE a.id = ?
    `,
      )
      .get(id) as AppointmentRow | undefined
    return row ?? null
  },

  updateStatus(id: number, status: string, _updatedBy: number): void {
    getDb()
      .prepare(`UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id)
  },

  convertToJobCard(id: number, jobCardId: number): void {
    getDb()
      .prepare(
        `
      UPDATE appointments SET
        job_card_id = ?,
        status = 'in_progress',
        updated_at = datetime('now')
      WHERE id = ?
    `,
      )
      .run(jobCardId, id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM appointments WHERE id = ?').run(id)
  },
}
