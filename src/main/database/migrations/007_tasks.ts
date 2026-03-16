import Database from 'better-sqlite3'

export function migration007(db: Database.Database): void {
  // ── Tasks ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      title               TEXT    NOT NULL,
      description         TEXT,
      task_type           TEXT    NOT NULL DEFAULT 'task'
                            CHECK(task_type IN ('task','delivery','appointment','reminder')),
      priority            TEXT    NOT NULL DEFAULT 'medium'
                            CHECK(priority IN ('high','medium','low')),
      status              TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','in_progress','done','cancelled')),
      start_datetime      TEXT,
      end_datetime        TEXT,
      due_date            TEXT,
      branch              TEXT,
      module              TEXT CHECK(module IN ('inventory','expenses','repairs','sales')),
      module_id           INTEGER,
      sale_id             INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      is_recurring        INTEGER NOT NULL DEFAULT 0,
      recurrence_type     TEXT CHECK(recurrence_type IN ('daily','weekly','monthly','yearly')),
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      recurrence_end_date TEXT,
      created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes               TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_type      ON tasks(task_type);
    CREATE INDEX IF NOT EXISTS idx_tasks_creator   ON tasks(created_by);
    CREATE INDEX IF NOT EXISTS idx_tasks_start     ON tasks(start_datetime);

    CREATE TABLE IF NOT EXISTS task_assignments (
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_assign_user ON task_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_assign_task ON task_assignments(task_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK(type IN ('assigned','due_soon','overdue','updated','completed')),
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      is_read    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(user_id, is_read);
  `)

  // ── New permissions ────────────────────────────────────────────────────────
  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)'
  )
  insertPerm.run('tasks.view',       'View tasks and calendar')
  insertPerm.run('tasks.create',     'Create tasks and events')
  insertPerm.run('tasks.edit',       'Edit tasks and events')
  insertPerm.run('tasks.delete',     'Delete tasks')
  insertPerm.run('tasks.assign',     'Assign tasks to employees')
  insertPerm.run('deliveries.view',  'View delivery schedule')
}
