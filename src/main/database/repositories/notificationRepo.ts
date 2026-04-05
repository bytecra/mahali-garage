import { getDb } from '../index'

export interface NotificationRow {
  id: number
  user_id: number
  task_id: number | null
  type: string
  title: string
  message: string
  is_read: number
  created_at: string
}

export const notificationRepo = {
  list(userId: number, limit = 30): NotificationRow[] {
    return getDb().prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as NotificationRow[]
  },

  getUnreadCount(userId: number): number {
    const row = getDb().prepare(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(userId) as { cnt: number }
    return row.cnt
  },

  create(data: {
    userId: number
    taskId: number | null
    type: string
    title: string
    message: string
  }): number {
    const result = getDb().prepare(`
      INSERT INTO notifications (user_id, task_id, type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.userId, data.taskId, data.type, data.title, data.message)
    return Number(result.lastInsertRowid)
  },

  markRead(id: number, userId: number): void {
    getDb().prepare(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
    ).run(id, userId)
  },

  markAllRead(userId: number): void {
    getDb().prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
    ).run(userId)
  },

  /** Called after task assignment: notify each assigned user */
  notifyAssigned(taskId: number, taskTitle: string, assigneeIds: number[]): void {
    const db = getDb()
    const ins = db.prepare(`
      INSERT INTO notifications (user_id, task_id, type, title, message)
      VALUES (?, ?, 'assigned', ?, ?)
    `)
    const txn = db.transaction(() => {
      for (const uid of assigneeIds) {
        ins.run(uid, taskId, 'Task Assigned', `You have been assigned: "${taskTitle}"`)
      }
    })
    txn()
  },
}
