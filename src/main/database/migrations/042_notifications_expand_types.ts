import Database from 'better-sqlite3'

/**
 * Remove strict CHECK on notifications.type so password-reset and other
 * app-specific types can be stored (007 only allowed task-related types).
 */
export function migration042(db: Database.Database): void {
  db.exec(`
    CREATE TABLE notifications_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      is_read    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO notifications_new
      (id, user_id, task_id, type, title, message, is_read, created_at)
    SELECT id, user_id, task_id, type, title, message, is_read, created_at
    FROM notifications;

    DROP TABLE notifications;
    ALTER TABLE notifications_new RENAME TO notifications;

    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(user_id, is_read);
  `)
}
