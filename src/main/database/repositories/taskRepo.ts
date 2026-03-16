import Database from 'better-sqlite3'
import { getDb } from '../index'
import {
  addDays, addWeeks, addMonths, addYears,
  parseISO, isAfter, isBefore, isEqual,
} from 'date-fns'

export interface TaskRow {
  id: number
  title: string
  description: string | null
  task_type: 'task' | 'delivery' | 'appointment' | 'reminder'
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'done' | 'cancelled'
  start_datetime: string | null
  end_datetime: string | null
  due_date: string | null
  branch: string | null
  module: string | null
  module_id: number | null
  sale_id: number | null
  is_recurring: number
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  recurrence_interval: number
  recurrence_end_date: string | null
  created_by: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined fields
  created_by_name?: string | null
  assignee_names?: string | null
  assignee_ids?: string | null
}

export interface TaskFilters {
  search?: string
  status?: string
  priority?: string
  task_type?: string
  branch?: string
  dateFrom?: string
  dateTo?: string
  assignedTo?: number
  viewerUserId?: number   // if set, filter to tasks assigned-to OR created-by this user
  page?: number
  pageSize?: number
}

export interface TaskInput {
  title: string
  description?: string | null
  task_type?: string
  priority?: string
  status?: string
  start_datetime?: string | null
  end_datetime?: string | null
  due_date?: string | null
  branch?: string | null
  module?: string | null
  module_id?: number | null
  sale_id?: number | null
  is_recurring?: number
  recurrence_type?: string | null
  recurrence_interval?: number
  recurrence_end_date?: string | null
  created_by?: number | null
  notes?: string | null
}

export interface CalendarEvent {
  id: string           // 'task-{id}' or 'task-{id}-rec-{iso}'
  taskId: number
  title: string
  start: string        // ISO datetime
  end: string          // ISO datetime
  task_type: string
  priority: string
  status: string
  branch: string | null
  assignee_names: string | null
  is_recurring_instance: boolean
  sale_id: number | null
}

function buildListQuery(filters: TaskFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (filters.viewerUserId !== undefined) {
    conditions.push('(t.created_by = ? OR ta_viewer.user_id = ?)')
    params.push(filters.viewerUserId, filters.viewerUserId)
  }
  if (filters.search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)')
    params.push(`%${filters.search}%`, `%${filters.search}%`)
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push('t.status = ?')
    params.push(filters.status)
  }
  if (filters.priority && filters.priority !== 'all') {
    conditions.push('t.priority = ?')
    params.push(filters.priority)
  }
  if (filters.task_type && filters.task_type !== 'all') {
    conditions.push('t.task_type = ?')
    params.push(filters.task_type)
  }
  if (filters.branch) {
    conditions.push('t.branch = ?')
    params.push(filters.branch)
  }
  if (filters.dateFrom) {
    conditions.push("(t.due_date >= ? OR t.start_datetime >= ?)")
    params.push(filters.dateFrom, filters.dateFrom)
  }
  if (filters.dateTo) {
    conditions.push("(t.due_date <= ? OR t.start_datetime <= ?)")
    params.push(filters.dateTo, filters.dateTo)
  }
  if (filters.assignedTo) {
    conditions.push('ta_filter.user_id = ?')
    params.push(filters.assignedTo)
  }

  const where = conditions.join(' AND ')
  return { sql: where, params }
}

export const taskRepo = {
  list(filters: TaskFilters = {}) {
    const db = getDb()
    const { page = 1, pageSize = 50 } = filters
    const offset = (page - 1) * pageSize

    const { sql: where, params } = buildListQuery(filters)

    const joinViewer = filters.viewerUserId !== undefined
      ? 'LEFT JOIN task_assignments ta_viewer ON ta_viewer.task_id = t.id AND ta_viewer.user_id = ?'
      : ''
    const joinFilter = filters.assignedTo
      ? 'JOIN task_assignments ta_filter ON ta_filter.task_id = t.id AND ta_filter.user_id = ?'
      : ''

    const allParams = [
      ...(filters.viewerUserId !== undefined ? [filters.viewerUserId] : []),
      ...(filters.assignedTo ? [filters.assignedTo] : []),
      ...params,
    ]

    const countSql = `
      SELECT COUNT(DISTINCT t.id) as cnt
      FROM tasks t
      ${joinViewer}
      ${joinFilter}
      WHERE ${where}
    `
    const total = (db.prepare(countSql).get(...allParams) as { cnt: number }).cnt

    const rowSql = `
      SELECT DISTINCT t.*,
        u.full_name AS created_by_name,
        (SELECT GROUP_CONCAT(ua.full_name, ', ')
         FROM task_assignments ta2
         JOIN users ua ON ua.id = ta2.user_id
         WHERE ta2.task_id = t.id) AS assignee_names,
        (SELECT GROUP_CONCAT(ta3.user_id, ',')
         FROM task_assignments ta3
         WHERE ta3.task_id = t.id) AS assignee_ids
      FROM tasks t
      ${joinViewer}
      ${joinFilter}
      LEFT JOIN users u ON u.id = t.created_by
      WHERE ${where}
      ORDER BY
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `
    const rows = db.prepare(rowSql).all(...allParams, pageSize, offset) as TaskRow[]
    return { rows, total, page, pageSize }
  },

  getById(id: number): TaskRow | null {
    const db = getDb()
    const row = db.prepare(`
      SELECT t.*,
        u.full_name AS created_by_name,
        (SELECT GROUP_CONCAT(ua.full_name, ', ')
         FROM task_assignments ta
         JOIN users ua ON ua.id = ta.user_id
         WHERE ta.task_id = t.id) AS assignee_names,
        (SELECT GROUP_CONCAT(ta2.user_id, ',')
         FROM task_assignments ta2
         WHERE ta2.task_id = t.id) AS assignee_ids
      FROM tasks t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `).get(id) as TaskRow | undefined
    return row ?? null
  },

  create(input: TaskInput): number {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO tasks (
        title, description, task_type, priority, status,
        start_datetime, end_datetime, due_date,
        branch, module, module_id, sale_id,
        is_recurring, recurrence_type, recurrence_interval, recurrence_end_date,
        created_by, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      input.title,
      input.description ?? null,
      input.task_type ?? 'task',
      input.priority ?? 'medium',
      input.status ?? 'pending',
      input.start_datetime ?? null,
      input.end_datetime ?? null,
      input.due_date ?? null,
      input.branch ?? null,
      input.module ?? null,
      input.module_id ?? null,
      input.sale_id ?? null,
      input.is_recurring ?? 0,
      input.recurrence_type ?? null,
      input.recurrence_interval ?? 1,
      input.recurrence_end_date ?? null,
      input.created_by ?? null,
      input.notes ?? null,
    )
    return Number(result.lastInsertRowid)
  },

  update(id: number, input: Partial<TaskInput>): void {
    const db = getDb()
    const fields: string[] = []
    const vals: unknown[] = []

    const allowed: (keyof TaskInput)[] = [
      'title','description','task_type','priority','status',
      'start_datetime','end_datetime','due_date','branch',
      'module','module_id','sale_id',
      'is_recurring','recurrence_type','recurrence_interval','recurrence_end_date',
      'notes',
    ]
    for (const key of allowed) {
      if (key in input) {
        fields.push(`${key} = ?`)
        vals.push(input[key] ?? null)
      }
    }
    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...vals, id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
  },

  setAssignees(taskId: number, userIds: number[], assignedBy: number): void {
    const db = getDb()
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(taskId)
      const ins = db.prepare(
        'INSERT OR IGNORE INTO task_assignments (task_id, user_id, assigned_by) VALUES (?,?,?)'
      )
      for (const uid of userIds) ins.run(taskId, uid, assignedBy)
    })
    txn()
  },

  getAssignees(taskId: number): { user_id: number; full_name: string }[] {
    return getDb().prepare(`
      SELECT ta.user_id, u.full_name
      FROM task_assignments ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ?
    `).all(taskId) as { user_id: number; full_name: string }[]
  },

  getSummary(viewerUserId?: number): {
    total: number; pending: number; in_progress: number; done: number;
    overdue: number; due_today: number; deliveries_today: number
  } {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()

    const viewFilter = viewerUserId !== undefined
      ? `AND (t.created_by = ${viewerUserId} OR EXISTS(
            SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.user_id = ${viewerUserId}))`
      : ''

    const count = (sql: string) =>
      (db.prepare(sql).get() as { cnt: number }).cnt

    return {
      total:          count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.status NOT IN ('cancelled') ${viewFilter}`),
      pending:        count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.status = 'pending' ${viewFilter}`),
      in_progress:    count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.status = 'in_progress' ${viewFilter}`),
      done:           count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.status = 'done' ${viewFilter}`),
      overdue:        count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.status NOT IN ('done','cancelled') AND t.due_date < '${today}' ${viewFilter}`),
      due_today:      count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.due_date = '${today}' AND t.status NOT IN ('done','cancelled') ${viewFilter}`),
      deliveries_today: count(`SELECT COUNT(*) as cnt FROM tasks t WHERE t.task_type = 'delivery' AND t.due_date = '${today}' AND t.status != 'cancelled' ${viewFilter}`),
    }
  },

  getForCalendar(dateFrom: string, dateTo: string, viewerUserId?: number): CalendarEvent[] {
    const db = getDb()
    const viewFilter = viewerUserId !== undefined
      ? `AND (t.created_by = ${viewerUserId} OR EXISTS(
            SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.user_id = ${viewerUserId}))`
      : ''

    const rows = db.prepare(`
      SELECT t.*,
        (SELECT GROUP_CONCAT(ua.full_name, ', ')
         FROM task_assignments ta
         JOIN users ua ON ua.id = ta.user_id
         WHERE ta.task_id = t.id) AS assignee_names
      FROM tasks t
      WHERE t.status != 'cancelled'
        AND (
          (t.start_datetime IS NOT NULL AND t.start_datetime <= ? AND t.end_datetime >= ?)
          OR (t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?)
          OR t.is_recurring = 1
        )
        ${viewFilter}
    `).all(dateTo, dateFrom, dateFrom, dateTo) as (TaskRow & { assignee_names: string | null })[]

    const from = parseISO(dateFrom)
    const to = parseISO(dateTo)
    const events: CalendarEvent[] = []

    for (const row of rows) {
      if (row.is_recurring && row.recurrence_type && row.start_datetime) {
        const instances = expandRecurring(row, from, to)
        events.push(...instances)
      } else {
        const start = row.start_datetime ?? row.due_date ?? row.created_at
        const end = row.end_datetime ?? start
        events.push({
          id: `task-${row.id}`,
          taskId: row.id,
          title: row.title,
          start,
          end,
          task_type: row.task_type,
          priority: row.priority,
          status: row.status,
          branch: row.branch,
          assignee_names: row.assignee_names ?? null,
          is_recurring_instance: false,
          sale_id: row.sale_id,
        })
      }
    }
    return events
  },
}

function expandRecurring(
  task: TaskRow & { assignee_names: string | null },
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  if (!task.start_datetime) return events

  const duration = task.end_datetime
    ? parseISO(task.end_datetime).getTime() - parseISO(task.start_datetime).getTime()
    : 0

  const recEnd = task.recurrence_end_date
    ? parseISO(task.recurrence_end_date)
    : rangeEnd

  const effectiveEnd = isBefore(recEnd, rangeEnd) ? recEnd : rangeEnd
  let current = parseISO(task.start_datetime)
  const interval = task.recurrence_interval ?? 1

  // Fast-forward to range start
  while (isBefore(current, rangeStart)) {
    current = advance(current, task.recurrence_type!, interval)
  }

  while (!isAfter(current, effectiveEnd)) {
    const endDt = new Date(current.getTime() + duration)
    const isoStart = current.toISOString()
    events.push({
      id: `task-${task.id}-rec-${isoStart}`,
      taskId: task.id,
      title: task.title,
      start: isoStart,
      end: endDt.toISOString(),
      task_type: task.task_type,
      priority: task.priority,
      status: task.status,
      branch: task.branch,
      assignee_names: task.assignee_names,
      is_recurring_instance: true,
      sale_id: task.sale_id,
    })
    current = advance(current, task.recurrence_type!, interval)
  }
  return events
}

function advance(date: Date, type: string, interval: number): Date {
  switch (type) {
    case 'daily':   return addDays(date, interval)
    case 'weekly':  return addWeeks(date, interval)
    case 'monthly': return addMonths(date, interval)
    case 'yearly':  return addYears(date, interval)
    default:        return addDays(date, interval)
  }
}
