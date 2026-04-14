import { getDb } from '../index'

export interface JobProgressCommentRow {
  id: number
  job_card_id: number
  user_id: number
  comment: string
  created_at: string
  user_name?: string
}

export const jobProgressRepo = {
  listByJob(jobCardId: number): JobProgressCommentRow[] {
    const db = getDb()
    return db.prepare(`
      SELECT c.*, u.full_name AS user_name
      FROM job_progress_comments c
      INNER JOIN users u ON c.user_id = u.id
      WHERE c.job_card_id = ?
      ORDER BY c.created_at DESC
    `).all(jobCardId) as JobProgressCommentRow[]
  },

  create(jobCardId: number, userId: number, comment: string): number {
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO job_progress_comments (job_card_id, user_id, comment)
      VALUES (?, ?, ?)
    `).run(jobCardId, userId, comment.trim())
    return r.lastInsertRowid as number
  },

  getById(id: number): { id: number; job_card_id: number; user_id: number } | null {
    return getDb().prepare(
      'SELECT id, job_card_id, user_id FROM job_progress_comments WHERE id = ?',
    ).get(id) as { id: number; job_card_id: number; user_id: number } | null
  },

  delete(id: number): boolean {
    getDb().prepare('DELETE FROM job_progress_comments WHERE id = ?').run(id)
    return true
  },
}
