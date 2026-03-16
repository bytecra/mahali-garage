import { getDb } from '../index'

export interface JobTypeRow {
  id: number
  name: string
  description: string | null
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
}

export const jobTypeRepo = {
  listAll(): JobTypeRow[] {
    return getDb().prepare('SELECT * FROM job_types ORDER BY sort_order ASC').all() as JobTypeRow[]
  },

  listActive(): JobTypeRow[] {
    return getDb().prepare('SELECT * FROM job_types WHERE is_active = 1 ORDER BY sort_order ASC').all() as JobTypeRow[]
  },

  getById(id: number): JobTypeRow | null {
    return (getDb().prepare('SELECT * FROM job_types WHERE id = ?').get(id) as JobTypeRow) || null
  },

  create(data: { name: string; description?: string; is_active?: boolean }): number {
    const db = getDb()
    const maxSort = (db.prepare('SELECT MAX(sort_order) as mx FROM job_types').get() as { mx: number | null }).mx ?? 0
    const result = db.prepare(
      'INSERT INTO job_types (name, description, is_active, sort_order) VALUES (?, ?, ?, ?)'
    ).run(data.name, data.description ?? null, data.is_active === false ? 0 : 1, maxSort + 1)
    return result.lastInsertRowid as number
  },

  update(id: number, data: { name?: string; description?: string; is_active?: boolean }): boolean {
    const db = getDb()
    const sets: string[] = []
    const vals: unknown[] = []
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name) }
    if (data.description !== undefined) { sets.push('description = ?'); vals.push(data.description) }
    if (data.is_active !== undefined) { sets.push('is_active = ?'); vals.push(data.is_active ? 1 : 0) }
    if (!sets.length) return false
    sets.push("updated_at = datetime('now')")
    vals.push(id)
    db.prepare(`UPDATE job_types SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  },

  delete(id: number): { success: boolean; error?: string } {
    const db = getDb()
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM job_cards WHERE job_type = (SELECT name FROM job_types WHERE id = ?)').get(id) as { cnt: number }).cnt
    if (count > 0) return { success: false, error: `Cannot delete: ${count} job card(s) use this type` }
    db.prepare('DELETE FROM job_types WHERE id = ?').run(id)
    return { success: true }
  },

  reorder(id: number, direction: 'up' | 'down'): boolean {
    const db = getDb()
    const current = db.prepare('SELECT * FROM job_types WHERE id = ?').get(id) as JobTypeRow | undefined
    if (!current) return false
    const swap = db.prepare(
      `SELECT * FROM job_types WHERE sort_order ${direction === 'up' ? '<' : '>'} ? ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1`
    ).get(current.sort_order) as JobTypeRow | undefined
    if (!swap) return false
    const txn = db.transaction(() => {
      db.prepare('UPDATE job_types SET sort_order = ? WHERE id = ?').run(swap.sort_order, current.id)
      db.prepare('UPDATE job_types SET sort_order = ? WHERE id = ?').run(current.sort_order, swap.id)
    })
    txn()
    return true
  },
}
