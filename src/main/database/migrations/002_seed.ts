import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

export function migration002(db: Database.Database): void {
  // ── Default permissions ───────────────────────────────────────────────────
  const permissionKeys = [
    ['sales.view',             'View sales and invoices'],
    ['sales.create',           'Create new sales'],
    ['sales.void',             'Void/cancel sales'],
    ['sales.discount',         'Apply discounts to sales'],
    ['inventory.view',         'View products and inventory'],
    ['inventory.edit',         'Add/edit products, categories, brands, suppliers'],
    ['inventory.delete',       'Delete products'],
    ['inventory.adjust_stock', 'Adjust product stock'],
    ['customers.view',         'View customer list and profiles'],
    ['customers.edit',         'Add/edit customers'],
    ['customers.delete',       'Delete customers'],
    ['repairs.view',           'View repair jobs'],
    ['repairs.edit',           'Create/edit repair jobs'],
    ['repairs.updateStatus',   'Update repair job status'],
    ['repairs.delete',         'Delete repair jobs'],
    ['reports.view',           'View all reports'],
    ['reports.export',         'Export reports to CSV/PDF'],
    ['users.manage',           'Create/edit/delete users and permissions'],
    ['settings.manage',        'Modify application settings'],
    ['backup.manage',          'Backup and restore database'],
    ['activity_log.view',      'View activity log'],
  ]

  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)'
  )
  for (const [key, description] of permissionKeys) {
    insertPerm.run(key, description)
  }

  // ── Default admin (owner) user ────────────────────────────────────────────
  const existingOwner = db
    .prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1")
    .get()

  if (!existingOwner) {
    const passwordHash = bcrypt.hashSync('admin123', 12)
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, 'owner', 1)
    `).run('admin', passwordHash, 'Administrator')
  }

  // ── Default settings ──────────────────────────────────────────────────────
  const defaults: Record<string, string> = {
    'store.name':                 'My Gaming Store',
    'store.address':              '',
    'store.phone':                '',
    'store.email':                '',
    'store.logo_path':            '',
    'store.currency':             'USD',
    'store.currency_symbol':      '$',
    'invoice.prefix':             'INV',
    'invoice.next_number':        '1',
    'sale.next_number':           '1',
    'repair.next_number':         '1',
    'invoice.footer_text':        'Thank you for your business!',
    'invoice.show_logo':          'true',
    'invoice.show_tax':           'true',
    'tax.enabled':                'false',
    'tax.rate':                   '0',
    'tax.name':                   'Tax',
    'appearance.theme':           'system',
    'appearance.language':        'en',
    'printer.enabled':            'false',
    'printer.name':               '',
    'printer.type':               'a4',
    'backup.auto_enabled':        'false',
    'backup.interval_days':       '7',
    'backup.path':                '',
    'payment_methods':            JSON.stringify(['cash','card','transfer','mobile']),
    'license.key':                '',
    'license.hardware_id':        '',
    'license.activated_at':       '',
    'license.grace_hardware_id':  '',
    'license.grace_until':        '',
    'activity_log.enabled':       'true',
  }

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value)
  }
}
