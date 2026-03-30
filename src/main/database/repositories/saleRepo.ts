import type Database from 'better-sqlite3'
import { getDb } from '../index'

function setting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value
}

function invoicePeriodKey(db: Database.Database): string {
  const reset = setting(db, 'invoice_reset') ?? 'never'
  const now = new Date()
  if (reset === 'yearly') return String(now.getFullYear())
  if (reset === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return ''
}

/** When period changes (year/month), reset sequence to starting number. */
function maybeResetInvoiceCounter(db: Database.Database): void {
  const reset = setting(db, 'invoice_reset') ?? 'never'
  if (reset !== 'yearly' && reset !== 'monthly') return
  const currentKey = invoicePeriodKey(db)
  const stored = setting(db, 'invoice.period_key') ?? ''
  if (!stored || stored === currentKey) return
  const start = parseInt(setting(db, 'invoice_starting_number') ?? '1', 10) || 1
  db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'invoice.next_number'`).run(String(start))
  db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'invoice.period_key'`).run(currentKey)
}

function markInvoicePeriod(db: Database.Database): void {
  const reset = setting(db, 'invoice_reset') ?? 'never'
  if (reset !== 'yearly' && reset !== 'monthly') return
  const currentKey = invoicePeriodKey(db)
  db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'invoice.period_key'`).run(currentKey)
}

function buildInvoiceNumber(db: Database.Database): string {
  maybeResetInvoiceCounter(db)
  const format = setting(db, 'invoice_number_format') ?? 'prefix_number'
  const invNextRaw = setting(db, 'invoice.next_number') ?? '1'
  const invNext = parseInt(invNextRaw, 10) || 1
  const padded = String(invNext).padStart(5, '0')
  if (format === 'number_only') return padded
  const custom = setting(db, 'invoice_prefix')
  const prefix = (custom != null && custom.trim() !== '')
    ? custom.trim()
    : (setting(db, 'invoice.prefix')?.trim() || 'INV')
  return `${prefix}-${padded}`
}

export interface SaleFilters {
  search?: string
  status?: string
  customerId?: number
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface SaleItemInput {
  product_id: number | null
  product_name: string
  product_sku: string | null
  unit_price: number
  cost_price: number
  quantity: number
  discount: number
  line_total: number
}

export interface PaymentInput {
  amount: number
  method: 'cash' | 'card' | 'transfer' | 'mobile' | 'other'
  reference?: string
  notes?: string
}

export interface CreateSaleInput {
  customer_id?: number | null
  user_id: number
  subtotal: number
  discount_type?: 'percent' | 'fixed' | null
  discount_value: number
  discount_amount: number
  tax_enabled: boolean
  tax_rate: number
  tax_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  notes?: string
  /** Stored on invoice row; defaults to mechanical for POS / non-garage sales. */
  department?: string
  items: SaleItemInput[]
  payments: PaymentInput[]
}

export const saleRepo = {
  list(filters: SaleFilters = {}) {
    const db = getDb()
    const { search, status, customerId, dateFrom, dateTo, page = 1, pageSize = 20 } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push(`(s.sale_number LIKE ? OR c.name LIKE ? OR i.invoice_number LIKE ?)`)
      const like = `%${search}%`
      params.push(like, like, like)
    }
    if (status) { conditions.push(`s.status = ?`); params.push(status) }
    if (customerId) { conditions.push(`s.customer_id = ?`); params.push(customerId) }
    if (dateFrom) { conditions.push(`date(s.created_at) >= ?`); params.push(dateFrom) }
    if (dateTo)   { conditions.push(`date(s.created_at) <= ?`); params.push(dateTo) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * pageSize

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      ${where}
    `).get(...params) as { cnt: number }).cnt

    const rows = db.prepare(`
      SELECT s.*, c.name as customer_name, i.invoice_number
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  getById(id: number) {
    const db = getDb()
    const sale = db.prepare(`
      SELECT s.*, c.name as customer_name, u.full_name as cashier_name, i.invoice_number
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      WHERE s.id = ?
    `).get(id)
    if (!sale) return null

    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id`).all(id)
    const payments = db.prepare(`SELECT * FROM payments WHERE sale_id = ? ORDER BY id`).all(id)
    return { ...(sale as object), items, payments }
  },

  create(input: CreateSaleInput): { sale_id: number; invoice_number: string } {
    const db = getDb()

    const txn = db.transaction(() => {
      const invoice_number = buildInvoiceNumber(db)
      const invNextRaw = setting(db, 'invoice.next_number') ?? '1'
      const invNext = parseInt(invNextRaw, 10) || 1

      const saleNumRaw = (db.prepare(`SELECT value FROM settings WHERE key = 'sale.next_number'`).get() as { value: string } | undefined)?.value ?? '1'
      const saleNext = parseInt(saleNumRaw, 10)
      const sale_number = `SALE-${String(saleNext).padStart(6, '0')}`

      const status = input.balance_due <= 0 ? 'completed' : 'partial'

      // Validate & update stock for each item
      for (const item of input.items) {
        if (!item.product_id) continue
        const product = db.prepare(`SELECT id, stock_quantity, name FROM products WHERE id = ?`).get(item.product_id) as { id: number; stock_quantity: number; name: string } | undefined
        if (!product) throw new Error(`Product not found: ${item.product_id}`)
        if (product.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for "${product.name}": have ${product.stock_quantity}, need ${item.quantity}`)
        }
      }

      // Insert sale
      const saleResult = db.prepare(`
        INSERT INTO sales (sale_number, customer_id, user_id, subtotal, discount_type, discount_value,
          discount_amount, tax_enabled, tax_rate, tax_amount, total_amount, amount_paid, balance_due, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sale_number,
        input.customer_id ?? null,
        input.user_id,
        input.subtotal,
        input.discount_type ?? null,
        input.discount_value,
        input.discount_amount,
        input.tax_enabled ? 1 : 0,
        input.tax_rate,
        input.tax_amount,
        input.total_amount,
        input.amount_paid,
        input.balance_due,
        status,
        input.notes ?? null,
      )
      const sale_id = saleResult.lastInsertRowid as number

      // Insert items + adjust stock
      for (const item of input.items) {
        db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, product_name, product_sku, unit_price, cost_price, quantity, discount, line_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sale_id, item.product_id, item.product_name, item.product_sku, item.unit_price, item.cost_price, item.quantity, item.discount, item.line_total)

        if (item.product_id) {
          const prod = db.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get(item.product_id) as { stock_quantity: number }
          const qty_before = prod.stock_quantity
          const qty_after = qty_before - item.quantity
          db.prepare(`UPDATE products SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(qty_after, item.product_id)
          db.prepare(`
            INSERT INTO stock_adjustments (product_id, user_id, type, quantity, qty_before, qty_after, reason, reference)
            VALUES (?, ?, 'out', ?, ?, ?, 'sale', ?)
          `).run(item.product_id, input.user_id, item.quantity, qty_before, qty_after, sale_number)
        }
      }

      // Insert payments
      for (const p of input.payments) {
        db.prepare(`
          INSERT INTO payments (sale_id, customer_id, amount, method, reference, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(sale_id, input.customer_id ?? null, p.amount, p.method, p.reference ?? null, p.notes ?? null)
      }

      // Update customer balance (negative = owes money)
      if (input.customer_id && input.balance_due > 0) {
        db.prepare(`UPDATE customers SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?`)
          .run(input.balance_due, input.customer_id)
      }

      const invDept = input.department === 'programming' || input.department === 'both' || input.department === 'mechanical'
        ? input.department
        : 'mechanical'
      db.prepare(`INSERT INTO invoices (sale_id, invoice_number, department) VALUES (?, ?, ?)`).run(sale_id, invoice_number, invDept)

      // Increment counters
      db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'invoice.next_number'`).run(String(invNext + 1))
      markInvoicePeriod(db)
      db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'sale.next_number'`).run(String(saleNext + 1))

      return { sale_id, invoice_number }
    })

    return txn() as { sale_id: number; invoice_number: string }
  },

  void(id: number, userId: number): boolean {
    const db = getDb()
    const txn = db.transaction(() => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as { status: string; customer_id: number | null; balance_due: number } | undefined
      if (!sale || sale.status === 'voided') throw new Error('Cannot void this sale')

      // Restore stock
      const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id) as Array<{ product_id: number | null; quantity: number }>
      for (const item of items) {
        if (!item.product_id) continue
        const prod = db.prepare(`SELECT stock_quantity FROM products WHERE id = ?`).get(item.product_id) as { stock_quantity: number }
        const qty_before = prod.stock_quantity
        const qty_after = qty_before + item.quantity
        db.prepare(`UPDATE products SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(qty_after, item.product_id)
        db.prepare(`
          INSERT INTO stock_adjustments (product_id, user_id, type, quantity, qty_before, qty_after, reason)
          VALUES (?, ?, 'return', ?, ?, ?, 'sale voided')
        `).run(item.product_id, userId, item.quantity, qty_before, qty_after)
      }

      // Restore customer balance
      if (sale.customer_id && sale.balance_due > 0) {
        db.prepare(`UPDATE customers SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`)
          .run(sale.balance_due, sale.customer_id)
      }

      db.prepare(`UPDATE sales SET status = 'voided', updated_at = datetime('now') WHERE id = ?`).run(id)
    })
    txn()
    return true
  },

  addPayment(saleId: number, payment: PaymentInput): boolean {
    const db = getDb()
    const txn = db.transaction(() => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as {
        customer_id: number | null; balance_due: number; amount_paid: number; total_amount: number; status: string
      } | undefined
      if (!sale || sale.status === 'voided') throw new Error('Cannot add payment to this sale')

      db.prepare(`INSERT INTO payments (sale_id, customer_id, amount, method, reference, notes) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(saleId, sale.customer_id, payment.amount, payment.method, payment.reference ?? null, payment.notes ?? null)

      const new_paid = sale.amount_paid + payment.amount
      const new_balance = Math.max(0, sale.total_amount - new_paid)
      const new_status = new_balance <= 0 ? 'completed' : 'partial'

      if (sale.customer_id && payment.amount > 0) {
        db.prepare(`UPDATE customers SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`)
          .run(Math.min(payment.amount, sale.balance_due), sale.customer_id)
      }

      db.prepare(`UPDATE sales SET amount_paid = ?, balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(new_paid, new_balance, new_status, saleId)
    })
    txn()
    return true
  },

  getDrafts(userId: number) {
    const db = getDb()
    return db.prepare(`
      SELECT s.*, COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.status = 'draft' AND s.user_id = ?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT 10
    `).all(userId)
  },

  saveDraft(input: CreateSaleInput): number {
    const db = getDb()
    const saleNumRaw = (db.prepare(`SELECT value FROM settings WHERE key = 'sale.next_number'`).get() as { value: string } | undefined)?.value ?? '1'
    const saleNext = parseInt(saleNumRaw, 10)
    const sale_number = `DRAFT-${String(saleNext).padStart(6, '0')}`

    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO sales (sale_number, customer_id, user_id, subtotal, discount_type, discount_value,
          discount_amount, tax_enabled, tax_rate, tax_amount, total_amount, amount_paid, balance_due, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
      `).run(sale_number, input.customer_id ?? null, input.user_id, input.subtotal, input.discount_type ?? null,
        input.discount_value, input.discount_amount, input.tax_enabled ? 1 : 0, input.tax_rate,
        input.tax_amount, input.total_amount, input.amount_paid, input.balance_due, input.notes ?? null)

      const sale_id = result.lastInsertRowid as number
      for (const item of input.items) {
        db.prepare(`INSERT INTO sale_items (sale_id, product_id, product_name, product_sku, unit_price, cost_price, quantity, discount, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(sale_id, item.product_id, item.product_name, item.product_sku, item.unit_price, item.cost_price, item.quantity, item.discount, item.line_total)
      }
      db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'sale.next_number'`).run(String(saleNext + 1))
      return sale_id
    })
    return txn() as number
  },

  deleteDraft(id: number): boolean {
    const db = getDb()
    const sale = db.prepare(`SELECT status FROM sales WHERE id = ?`).get(id) as { status: string } | undefined
    if (!sale || sale.status !== 'draft') return false
    db.prepare(`DELETE FROM sales WHERE id = ?`).run(id)
    return true
  },

  getDraftById(id: number) {
    const db = getDb()
    const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND status = 'draft'`).get(id)
    if (!sale) return null
    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id)
    return { ...(sale as object), items }
  },
}
