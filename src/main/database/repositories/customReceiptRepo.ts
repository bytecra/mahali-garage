import { getDb } from '../index'
import { insertCustomReceiptCashInTx } from './cashDrawerRepo'

type Department = 'mechanical' | 'programming' | 'both'

interface CustomServiceLine {
  service_name: string
  cost: number
  sell_price: number
}

export interface CustomReceiptInput {
  department: Department
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  customer_address?: string | null
  plate_number?: string | null
  car_company?: string | null
  car_model?: string | null
  car_year?: string | null
  mechanical_services?: CustomServiceLine[]
  programming_services?: CustomServiceLine[]
  amount: number
  payment_method?: string | null
  /** For Cash: actual bills/coins received (≥ amount). Omitted = exact amount. */
  cash_received?: number | null
  notes?: string | null
  created_by: number
}

export interface CustomReceiptFilters {
  search?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export const customReceiptRepo = {
  create(input: CustomReceiptInput): { id: number; receipt_number: string } {
    const db = getDb()
    const method = (input.payment_method || 'Cash').toLowerCase()
    let cashReceivedCol: number | null = null
    if (method === 'cash') {
      let cr = input.cash_received
      if (cr == null || cr <= 0) cr = input.amount
      if (cr + 1e-9 < input.amount) throw new Error('Cash received cannot be less than the receipt total')
      cashReceivedCol = cr
    }

    const year = new Date().getFullYear()
    const nextRaw = (
      db.prepare(`SELECT value FROM settings WHERE key = 'custom_receipt.next_number'`).get() as
        { value: string } | undefined
    )?.value ?? '1'
    const next = parseInt(nextRaw, 10)
    const receipt_number = `CR-${year}-${String(next).padStart(4, '0')}`

    const txn = db.transaction(() => {
      const mechanical = normalizeLines(input.mechanical_services)
      const programming = normalizeLines(input.programming_services)
      const carType = [input.car_company, input.car_model, input.car_year].filter(Boolean).join(' ').trim() || null
      const servicesText = servicesDescriptionFromLines(mechanical, programming)
      const result = db.prepare(`
      INSERT INTO custom_receipts
        (receipt_number, department, customer_name, customer_phone, customer_email, customer_address,
         plate_number, car_company, car_model, car_year, car_type,
         services_description, mechanical_services_json, programming_services_json,
         amount, payment_method, notes, created_by, cash_received)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      receipt_number,
      normalizeDepartment(input.department),
      input.customer_name?.trim() || 'Walk-in Customer',
      cleanText(input.customer_phone),
      cleanText(input.customer_email),
      cleanText(input.customer_address),
      cleanText(input.plate_number),
      cleanText(input.car_company),
      cleanText(input.car_model),
      cleanText(input.car_year),
      carType,
      servicesText,
      JSON.stringify(mechanical),
      JSON.stringify(programming),
      input.amount,
      input.payment_method || 'Cash',
      cleanText(input.notes),
      input.created_by,
      cashReceivedCol,
    )

      const id = result.lastInsertRowid as number
      db.prepare(`UPDATE settings SET value = ? WHERE key = 'custom_receipt.next_number'`).run(String(next + 1))

      if (method === 'cash' && cashReceivedCol != null && cashReceivedCol > 0) {
        const row = db.prepare(`
          SELECT created_at FROM custom_receipts WHERE id = ?
        `).get(id) as { created_at: string } | undefined
        if (row) {
          insertCustomReceiptCashInTx(db, {
            createdAt: row.created_at,
            businessDate: row.created_at.slice(0, 10),
            receiptNumber: receipt_number,
            amount: input.amount,
            cashReceived: cashReceivedCol,
          })
        }
      }

      return { id, receipt_number }
    })

    return txn()
  },

  getById(id: number) {
    const db = getDb()
    return db.prepare(`
      SELECT cr.*, u.full_name as created_by_name
      FROM custom_receipts cr
      LEFT JOIN users u ON cr.created_by = u.id
      WHERE cr.id = ?
    `).get(id)
  },

  list(filters: CustomReceiptFilters = {}) {
    const db = getDb()
    const { search, startDate, endDate, page = 1, pageSize = 50 } = filters
    const offset = (page - 1) * pageSize
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push(
        `(cr.receipt_number LIKE ? OR cr.customer_name LIKE ? OR cr.plate_number LIKE ? OR cr.car_type LIKE ? OR cr.car_company LIKE ? OR cr.car_model LIKE ?)`
      )
      const like = `%${search}%`
      params.push(like, like, like, like, like, like)
    }
    if (startDate) {
      conditions.push('DATE(cr.created_at) >= ?')
      params.push(startDate)
    }
    if (endDate) {
      conditions.push('DATE(cr.created_at) <= ?')
      params.push(endDate)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt FROM custom_receipts cr ${where}
    `).get(...params) as { cnt: number }).cnt

    const rows = db.prepare(`
      SELECT cr.*, u.full_name as created_by_name
      FROM custom_receipts cr
      LEFT JOIN users u ON cr.created_by = u.id
      ${where}
      ORDER BY cr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return { rows, total, page, pageSize }
  },

  delete(id: number): boolean {
    getDb().prepare('DELETE FROM custom_receipts WHERE id = ?').run(id)
    return true
  },
}

function cleanText(value?: string | null): string | null {
  const v = value?.trim()
  return v ? v : null
}

function normalizeDepartment(value: string): Department {
  if (value === 'mechanical' || value === 'programming' || value === 'both') return value
  return 'both'
}

function normalizeLines(lines: CustomServiceLine[] | undefined): CustomServiceLine[] {
  return (lines ?? [])
    .map(line => ({
      service_name: String(line.service_name ?? '').trim(),
      cost: Number(line.cost ?? 0),
      sell_price: Number(line.sell_price ?? 0),
    }))
    .filter(line => line.service_name && Number.isFinite(line.sell_price) && line.sell_price >= 0)
    .map(line => ({
      service_name: line.service_name,
      cost: Number.isFinite(line.cost) ? line.cost : 0,
      sell_price: line.sell_price,
    }))
}

function servicesDescriptionFromLines(
  mechanical: CustomServiceLine[],
  programming: CustomServiceLine[]
): string | null {
  const all = [...mechanical, ...programming]
  if (all.length === 0) return null
  return all.map((line, index) => `${index + 1}. ${line.service_name}`).join('\n')
}
