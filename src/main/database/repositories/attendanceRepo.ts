import { getDb } from '../index'

export interface AttendanceStatusType {
  id: number
  name: string
  color: string
  emoji: string | null
  is_default: number
  is_paid: number
  counts_as_working: number
  sort_order: number
  created_by: number | null
  created_at: string
}

export interface CreateStatusInput {
  name: string
  color: string
  emoji?: string
  is_paid: number
  counts_as_working: number
  created_by?: number
}

export interface MarkAttendanceInput {
  employee_id: number
  date: string
  status_type_id: number
  department?: string
  notes?: string
  marked_by: number
}

export interface BulkMarkInput {
  employee_ids: number[]
  dates: string[]
  status_type_id: number
  department?: string
  notes?: string
  marked_by: number
  overwrite?: boolean
}

export interface AttendanceRecordRow {
  id: number
  date: string
  status_type_id: number
  status_name: string
  status_color: string
  status_emoji: string
  notes: string | null
  marked_by_name: string | null
  marked_at: string
}

export interface AttendanceSummary {
  total_working_days: number
  present_days: number
  attendance_rate: number
  by_status: Array<{
    status_name: string
    status_color: string
    status_emoji: string
    count: number
  }>
}

export interface AttendanceReportRow {
  id: number
  date: string
  status_name: string
  status_color: string
  status_emoji: string
  notes: string | null
  marked_at: string
  marked_by_name: string | null
}

function monthRangeIso(year: number, month: number): { from: string; toExclusive: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month)}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const toExclusive = `${nextYear}-${pad(nextMonth)}-01`
  return { from, toExclusive }
}

export const attendanceRepo = {
  getAttendanceStatuses(): AttendanceStatusType[] {
    const db = getDb()
    return db
      .prepare(
        `SELECT * FROM attendance_status_types
         ORDER BY sort_order ASC, id ASC`
      )
      .all() as AttendanceStatusType[]
  },

  createStatus(data: CreateStatusInput): { id: number } {
    const db = getDb()
    const maxRow = db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM attendance_status_types`)
      .get() as { m: number }
    const sortOrder = maxRow.m + 1
    const r = db
      .prepare(
        `INSERT INTO attendance_status_types
          (name, color, emoji, is_default, is_paid, counts_as_working, sort_order, created_by)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        data.name,
        data.color,
        data.emoji ?? null,
        data.is_paid,
        data.counts_as_working,
        sortOrder,
        data.created_by ?? null
      )
    return { id: Number(r.lastInsertRowid) }
  },

  updateStatus(id: number, data: Partial<CreateStatusInput>): void {
    const db = getDb()
    const row = db
      .prepare(`SELECT is_default, name, emoji FROM attendance_status_types WHERE id = ?`)
      .get(id) as { is_default: number; name: string; emoji: string | null } | undefined
    if (!row) throw new Error('Status not found')

    if (row.is_default === 1) {
      if (data.name !== undefined && data.name !== row.name)
        throw new Error('Cannot rename default attendance status')
      if (data.emoji !== undefined && (data.emoji ?? null) !== row.emoji)
        throw new Error('Cannot change emoji on default attendance status')
    }

    const sets: string[] = []
    const vals: unknown[] = []
    if (data.name !== undefined) {
      sets.push('name = ?')
      vals.push(data.name)
    }
    if (data.color !== undefined) {
      sets.push('color = ?')
      vals.push(data.color)
    }
    if (data.emoji !== undefined) {
      sets.push('emoji = ?')
      vals.push(data.emoji ?? null)
    }
    if (data.is_paid !== undefined) {
      sets.push('is_paid = ?')
      vals.push(data.is_paid)
    }
    if (data.counts_as_working !== undefined) {
      sets.push('counts_as_working = ?')
      vals.push(data.counts_as_working)
    }
    if (sets.length === 0) return
    vals.push(id)
    db.prepare(`UPDATE attendance_status_types SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  },

  deleteStatus(id: number): void {
    const db = getDb()
    const row = db
      .prepare(`SELECT is_default FROM attendance_status_types WHERE id = ?`)
      .get(id) as { is_default: number } | undefined
    if (!row) throw new Error('Status not found')
    if (row.is_default === 1) throw new Error('Cannot delete default attendance status')
    db.prepare(`DELETE FROM attendance_status_types WHERE id = ?`).run(id)
  },

  markAttendance(data: MarkAttendanceInput): void {
    const db = getDb()
    db.prepare(
      `INSERT INTO employee_attendance
        (employee_id, date, status_type_id, department, notes, marked_by, marked_at)
       VALUES (?, ?, ?, COALESCE(?, 'all'), ?, ?, datetime('now'))
       ON CONFLICT(employee_id, date) DO UPDATE SET
         status_type_id = excluded.status_type_id,
         department = excluded.department,
         notes = excluded.notes,
         marked_by = excluded.marked_by,
         marked_at = datetime('now')`
    ).run(
      data.employee_id,
      data.date,
      data.status_type_id,
      data.department ?? null,
      data.notes ?? null,
      data.marked_by
    )
  },

  bulkMarkAttendance(data: BulkMarkInput): { marked: number; skipped: number } {
    const db = getDb()
    let marked = 0
    let skipped = 0

    const replaceStmt = db.prepare(
      `INSERT INTO employee_attendance
        (employee_id, date, status_type_id, department, notes, marked_by, marked_at)
       VALUES (?, ?, ?, COALESCE(?, 'all'), ?, ?, datetime('now'))
       ON CONFLICT(employee_id, date) DO UPDATE SET
         status_type_id = excluded.status_type_id,
         department = excluded.department,
         notes = excluded.notes,
         marked_by = excluded.marked_by,
         marked_at = datetime('now')`
    )
    const ignoreStmt = db.prepare(
      `INSERT OR IGNORE INTO employee_attendance
        (employee_id, date, status_type_id, department, notes, marked_by, marked_at)
       VALUES (?, ?, ?, COALESCE(?, 'all'), ?, ?, datetime('now'))`
    )

    const stmt = data.overwrite ? replaceStmt : ignoreStmt

    for (const employeeId of data.employee_ids) {
      for (const date of data.dates) {
        const r = stmt.run(
          employeeId,
          date,
          data.status_type_id,
          data.department ?? null,
          data.notes ?? null,
          data.marked_by
        )
        if (r.changes > 0) marked += 1
        else skipped += 1
      }
    }

    return { marked, skipped }
  },

  getAttendance(employeeId: number, year: number, month: number): AttendanceRecordRow[] {
    const db = getDb()
    const { from, toExclusive } = monthRangeIso(year, month)
    return db
      .prepare(
        `SELECT
           ea.id,
           ea.date,
           ea.status_type_id,
           st.name AS status_name,
           st.color AS status_color,
           IFNULL(st.emoji, '') AS status_emoji,
           ea.notes,
           u.full_name AS marked_by_name,
           ea.marked_at
         FROM employee_attendance ea
         JOIN attendance_status_types st ON st.id = ea.status_type_id
         LEFT JOIN users u ON u.id = ea.marked_by
         WHERE ea.employee_id = ?
           AND ea.date >= ?
           AND ea.date < ?
         ORDER BY ea.date ASC`
      )
      .all(employeeId, from, toExclusive) as AttendanceRecordRow[]
  },

  getAttendanceSummary(employeeId: number, year: number, month: number): AttendanceSummary {
    const db = getDb()
    const { from, toExclusive } = monthRangeIso(year, month)

    const byStatus = db
      .prepare(
        `SELECT
           st.name AS status_name,
           st.color AS status_color,
           IFNULL(st.emoji, '') AS status_emoji,
           COUNT(*) AS count
         FROM employee_attendance ea
         JOIN attendance_status_types st ON st.id = ea.status_type_id
         WHERE ea.employee_id = ?
           AND ea.date >= ?
           AND ea.date < ?
         GROUP BY st.id
         ORDER BY st.sort_order ASC`
      )
      .all(employeeId, from, toExclusive) as Array<{
      status_name: string
      status_color: string
      status_emoji: string
      count: number
    }>

    const agg = db
      .prepare(
        `SELECT
           SUM(CASE WHEN st.name = 'Present' THEN 1 ELSE 0 END) AS present_days,
           SUM(CASE WHEN st.counts_as_working = 1 THEN 1 ELSE 0 END) AS total_working_days
         FROM employee_attendance ea
         JOIN attendance_status_types st ON st.id = ea.status_type_id
         WHERE ea.employee_id = ?
           AND ea.date >= ?
           AND ea.date < ?`
      )
      .get(employeeId, from, toExclusive) as {
      present_days: number | null
      total_working_days: number | null
    }

    const presentDays = Number(agg.present_days ?? 0)
    const totalWorking = Number(agg.total_working_days ?? 0)
    const attendanceRate = totalWorking > 0 ? presentDays / totalWorking : 0

    return {
      total_working_days: totalWorking,
      present_days: presentDays,
      attendance_rate: attendanceRate,
      by_status: byStatus.map(r => ({
        status_name: r.status_name,
        status_color: r.status_color,
        status_emoji: r.status_emoji,
        count: r.count,
      })),
    }
  },

  getMonthlyAttendanceReport(
    employeeId: number,
    fromDate: string,
    toDate: string
  ): AttendanceReportRow[] {
    const db = getDb()
    return db
      .prepare(
        `SELECT
           ea.id,
           ea.date,
           st.name AS status_name,
           st.color AS status_color,
           IFNULL(st.emoji, '') AS status_emoji,
           ea.notes,
           ea.marked_at,
           u.full_name AS marked_by_name
         FROM employee_attendance ea
         JOIN attendance_status_types st ON st.id = ea.status_type_id
         LEFT JOIN users u ON u.id = ea.marked_by
         WHERE ea.employee_id = ?
           AND ea.date >= ?
           AND ea.date <= ?
         ORDER BY ea.date ASC, ea.id ASC`
      )
      .all(employeeId, fromDate, toDate) as AttendanceReportRow[]
  },
}
