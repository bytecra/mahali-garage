import Database from 'better-sqlite3'
import log from '../../utils/logger'
import { migration001 } from './001_initial'
import { migration002 } from './002_seed'
import { migration003 } from './003_add_counters'
import { migration004 } from './004_partners'
import { migration005 } from './005_expenses'
import { migration006, preUp006 } from './006_role_permissions'
import { migration007 } from './007_tasks'
import { migration008 } from './008_branding'
import { migration009 } from './009_garage'
import { migration010 } from './010_job_types'
import { migration011 } from './011_patch_job_cards'
import { migration012 } from './012_custom_receipts'
import { migration013 } from './013_backup_settings'
import { migration014 } from './014_employees'
import { migration015 } from './015_expense_due_date'
import { migration016 } from './016_department'
import { migration017 } from './017_garage_invoice_settings'
import { migration018 } from './018_service_catalog'
import { migration019 } from './019_expense_department'
import { migration020 } from './020_cash_drawer'
import { migration021 } from './021_cash_received_and_drawer_fk'
import { migration022 } from './022_assets'
import { migration023 } from './023_custom_receipts_redesign'
import { migration024 } from './024_custom_receipts_smart_recipe'
import { migration025 } from './025_fix_store_name_default'
import { migration026 } from './026_ensure_department_columns'
import { migration027 } from './027_job_cards_status_check_update'
import { migration028 } from './028_employee_payroll'
import { migration029 } from './029_user_auth_type_passcode'
import { migration030 } from './030_performance_indexes'
import { migration031 } from './031_custom_receipt_discount'
import { migration032 } from './032_seed_car_brands'
import { migration033 } from './033_loyalty'
import { migration034 } from './034_dev_reset_codes'
import { migration035 } from './035_appointments'
import { migration036 } from './036_attendance'
import { migration037 } from './037_documents_and_reset'
import { migration038 } from './038_employee_extensions'
import { migration039 } from './039_fix_documents'
import { migration040 } from './040_employees_attendance_permission'
import { migration041 } from './041_lowercase_employee_departments'
import { migration042 } from './042_notifications_expand_types'
import { migration043 } from './043_inspection_diagram'
import { migration044 } from './044_ensure_appointments'
import { migration045 } from './045_custom_receipt_change_amount'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
  /** Runs OUTSIDE the transaction — for DDL that requires FK constraints disabled */
  preUp?: (db: Database.Database) => void
}

const migrations: Migration[] = [
  { version: 1, name: '001_initial',          up: migration001 },
  { version: 2, name: '002_seed',             up: migration002 },
  { version: 3, name: '003_add_counters',     up: migration003 },
  { version: 4, name: '004_partners',         up: migration004 },
  { version: 5, name: '005_expenses',         up: migration005 },
  { version: 6, name: '006_role_permissions', up: migration006, preUp: preUp006 },
  { version: 7, name: '007_tasks',            up: migration007 },
  { version: 8, name: '008_branding',         up: migration008 },
  { version: 9, name: '009_garage',           up: migration009 },
  { version: 10, name: '010_job_types',       up: migration010 },
  { version: 11, name: '011_patch_job_cards', up: migration011 },
  { version: 12, name: '012_custom_receipts', up: migration012 },
  { version: 13, name: '013_backup_settings', up: migration013 },
  { version: 14, name: '014_employees',       up: migration014 },
  { version: 15, name: '015_expense_due_date', up: migration015 },
  { version: 16, name: '016_department', up: migration016 },
  { version: 17, name: '017_garage_invoice_settings', up: migration017 },
  { version: 18, name: '018_service_catalog', up: migration018 },
  { version: 19, name: '019_expense_department', up: migration019 },
  { version: 20, name: '020_cash_drawer', up: migration020 },
  { version: 21, name: '021_cash_received_and_drawer_fk', up: migration021 },
  { version: 22, name: '022_assets', up: migration022 },
  { version: 23, name: '023_custom_receipts_redesign', up: migration023 },
  { version: 24, name: '024_custom_receipts_smart_recipe', up: migration024 },
  { version: 25, name: '025_fix_store_name_default',      up: migration025 },
  { version: 26, name: '026_ensure_department_columns',   up: migration026 },
  { version: 27, name: '027_job_cards_status_check_update', up: migration027 },
  { version: 28, name: '028_employee_payroll', up: migration028 },
  { version: 29, name: '029_user_auth_type_passcode', up: migration029 },
  { version: 30, name: '030_performance_indexes', up: migration030 },
  { version: 31, name: '031_custom_receipt_discount', up: migration031 },
  { version: 32, name: '032_seed_car_brands', up: migration032 },
  { version: 33, name: '033_loyalty', up: migration033 },
  { version: 34, name: '034_dev_reset_codes', up: migration034 },
  { version: 35, name: '035_appointments', up: migration035 },
  { version: 36, name: '036_attendance', up: migration036 },
  { version: 37, name: '037_documents_and_reset', up: migration037 },
  { version: 38, name: '038_employee_extensions', up: migration038 },
  { version: 39, name: '039_fix_documents', up: migration039 },
  { version: 40, name: '040_employees_attendance_permission', up: migration040 },
  { version: 41, name: '041_lowercase_employee_departments', up: migration041 },
  { version: 42, name: '042_notifications_expand_types', up: migration042 },
  { version: 43, name: '043_inspection_diagram', up: migration043 },
  { version: 44, name: '044_ensure_appointments', up: migration044 },
  { version: 45, name: '045_custom_receipt_change_amount', up: migration045 },
]

export async function runMigrations(db: Database.Database): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      run_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const getApplied = db.prepare('SELECT version FROM _migrations')
  const applied = new Set((getApplied.all() as { version: number }[]).map(r => r.version))

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (version, name) VALUES (?, ?)'
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    log.info(`Running migration ${migration.name}...`)

    if (migration.preUp) migration.preUp(db)

    const run = db.transaction(() => {
      migration.up(db)
      insertMigration.run(migration.version, migration.name)
    })
    run()
    log.info(`Migration ${migration.name} completed.`)
  }
}
