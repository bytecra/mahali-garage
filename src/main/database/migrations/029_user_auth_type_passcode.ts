import Database from 'better-sqlite3'

export function migration029(db: Database.Database): void {
  try {
    db.exec(`
      ALTER TABLE users ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'
        CHECK(auth_type IN ('password','passcode_4','passcode_6'));
    `)
  } catch {
    /* column already exists */
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN passcode TEXT;`)
  } catch {
    /* column already exists */
  }
}

