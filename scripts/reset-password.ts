#!/usr/bin/env node
/**
 * CLI backup password reset — direct DB access on the machine.
 *
 * Usage:
 *   npm run reset-password -- --user admin --pass newpass123
 *   npm run reset-password -- --user admin --pass newpass123 --db "C:\\custom\\path\\mahali.db"
 */

import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'

function defaultDbPath(): string {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return path.join(appData, 'Mahali Garage', 'mahali.db')
  }
  if (process.platform === 'darwin') {
    return path.join(
      home,
      'Library',
      'Application Support',
      'Mahali Garage',
      'mahali.db'
    )
  }
  return path.join(home, '.config', 'Mahali Garage', 'mahali.db')
}

function parseArgs(): { user: string; pass: string; db: string } {
  const args = process.argv.slice(2)
  let user = ''
  let pass = ''
  let db = ''

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--user' && args[i + 1]) {
      user = args[++i]
    } else if (a === '--pass' && args[i + 1]) {
      pass = args[++i]
    } else if (a === '--db' && args[i + 1]) {
      db = args[++i]
    }
  }

  if (!user.trim()) {
    console.error('ERROR: --user is required.\n')
    console.error(
      'Usage: npm run reset-password -- --user <USERNAME> --pass <NEW_PASSWORD> [--db <PATH>]\n'
    )
    process.exit(1)
  }
  if (!pass) {
    console.error('ERROR: --pass is required.\n')
    console.error(
      'Usage: npm run reset-password -- --user <USERNAME> --pass <NEW_PASSWORD> [--db <PATH>]\n'
    )
    process.exit(1)
  }

  const dbPath = db.trim() || defaultDbPath()
  return { user: user.trim(), pass, db: dbPath }
}

/** Escape a string for use inside single-quoted SQL literals. */
function sqlStringLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function askYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      const y = answer.trim().toLowerCase()
      resolve(y === 'y' || y === 'yes')
    })
  })
}

async function main(): Promise<void> {
  const { user, pass, db: dbPath } = parseArgs()

  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: Database file not found:\n  ${dbPath}\n`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(pass, 10)

  const sqlDisplay = `UPDATE users 
SET password_hash = ${sqlStringLiteral(hash)},
    updated_at = datetime('now')
WHERE username = ${sqlStringLiteral(user)};`

  console.log('')
  console.log(`✅ Password reset for user: ${user}`)
  console.log(`New password: ${pass}`)
  console.log('')
  console.log('SQL (for manual use):')
  console.log(sqlDisplay)
  console.log('')

  const apply = await askYesNo('Apply directly? (y/n) ')
  if (!apply) {
    console.log('Skipped. Run the SQL above manually if needed.')
    process.exit(0)
  }

  const db = new Database(dbPath)
  try {
    const result = db
      .prepare(
        `UPDATE users 
         SET password_hash = ?,
             updated_at = datetime('now')
         WHERE username = ?`
      )
      .run(hash, user)
    if (result.changes === 0) {
      console.error(`ERROR: No row updated — username "${user}" not found.`)
      process.exit(1)
    }
    console.log('Applied successfully.')
  } finally {
    db.close()
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
