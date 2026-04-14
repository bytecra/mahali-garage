import { getDb } from '../index'

interface LogEntry {
  userId: number | null
  action: string
  entity?: string
  entityId?: number | null
  details?: string
}

export interface ActivityLogRow {
  id: number
  user_id: number | null
  full_name: string | null
  action: string
  entity: string | null
  entity_id: number | null
  details: string | null
  created_at: string
}

interface LogFilters {
  from?: string
  to?: string
  userId?: number
  action?: string
  limit?: number
  offset?: number
}

export const activityLogRepo = {
  log(entry: LogEntry): void {
    const db = getDb()
    db.prepare(
      `INSERT INTO activity_log (user_id, action, entity, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      entry.userId ?? null,
      entry.action,
      entry.entity ?? null,
      entry.entityId ?? null,
      entry.details ?? null
    )
  },

  list(filters: LogFilters = {}): { rows: ActivityLogRow[]; total: number } {
    const db = getDb()
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (filters.from)   { conditions.push("al.created_at >= ?"); params.push(filters.from) }
    if (filters.to)     { conditions.push("al.created_at <= ?"); params.push(filters.to + ' 23:59:59') }
    if (filters.userId) { conditions.push("al.user_id = ?");     params.push(filters.userId) }
    if (filters.action) { conditions.push("al.action LIKE ?");   params.push(`%${filters.action}%`) }

    const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit  = filters.limit  ?? 100
    const offset = filters.offset ?? 0

    const total = (
      db.prepare(`SELECT COUNT(*) as n FROM activity_log al ${where}`).get(...params) as { n: number }
    ).n

    const rows = db.prepare(`
      SELECT al.id, al.user_id, u.full_name, al.action, al.entity, al.entity_id, al.details, al.created_at
      FROM activity_log al
      LEFT JOIN users u ON u.id = al.user_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ActivityLogRow[]

    return { rows, total }
  },

  listByEntity(entity: string, entityId: number, limit = 200): ActivityLogRow[] {
    const db = getDb()
    return db.prepare(`
      SELECT al.id, al.user_id, u.full_name, al.action, al.entity, al.entity_id, al.details, al.created_at
      FROM activity_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity = ? AND al.entity_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(entity, entityId, Math.max(1, Math.min(1000, limit))) as ActivityLogRow[]
  },
}
