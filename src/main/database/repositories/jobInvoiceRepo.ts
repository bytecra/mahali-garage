import { getDb } from '../index'
import { warrantyRepo } from './warrantyRepo'

export interface JobInvoiceRow {
  id: number
  job_card_id: number
  owner_id: number
  vehicle_id: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  subtotal?: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  discount_type?: string | null
  discount_value?: number | null
  notes?: string | null
  payment_terms?: string | null
  /** 1 = print car inspection diagram on this job invoice */
  include_inspection_on_invoice?: number | null
  /** From job_cards when loaded via join (for printing) */
  job_number?: string | null
  inspection_data?: string | null
}

export interface JobInvoiceItemRow {
  id: number
  job_invoice_id: number
  description: string
  quantity: number
  unit_price: number
  total_price: number
  service_catalog_id?: number | null
  default_unit_price?: number | null
  custom_unit_price?: number | null
  job_part_id?: number | null
}

/** Free-form draft lines (from job parts and/or manual rows). */
export interface JobInvoiceLineInput {
  job_part_id?: number | null
  description: string
  quantity: number
  unit_price: number
  service_catalog_id?: number | null
  default_unit_price?: number | null
}

/** When provided, builds invoice from these job_parts lines (qty/unit from payload). Omit to use all job lines. */
export interface CreateJobInvoicePayload {
  parts?: Array<{ job_part_id: number; quantity: number; unit_price: number }>
  /**
   * Full line list (job-linked and/or manual rows). When set, used instead of resolving from `parts` / all job lines.
   */
  items?: JobInvoiceLineInput[]
  notes?: string | null
  payment_terms?: string | null
  /** Percent 0–100; falls back to job_cards.tax_rate when omitted. */
  tax_rate?: number
  discount_type?: 'percentage' | 'fixed' | null
  /** Raw discount: percent value or fixed AED amount depending on discount_type. */
  discount_value?: number
  /** When generating invoice, set display flag; otherwise copied from job preference. */
  include_inspection_on_invoice?: boolean
}

export interface UpdateJobInvoicePayload {
  items: JobInvoiceLineInput[]
  tax_rate?: number
  discount_type?: 'percentage' | 'fixed' | null
  discount_value?: number
  notes?: string | null
  payment_terms?: string | null
  include_inspection_on_invoice?: boolean
}

type JobPartRow = {
  id: number
  description: string | null
  quantity: number
  unit_price: number
  total: number
  service_catalog_id: number | null
  default_unit_price: number | null
  cost_price: number | null
}

function nextInvoiceNumber(db: ReturnType<typeof getDb>): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const prefix = `INV-${y}${m}${d}-`
  const row = db.prepare(`
    SELECT invoice_number FROM job_invoices
    WHERE invoice_number LIKE ?
    ORDER BY invoice_number DESC LIMIT 1
  `).get(`${prefix}%`) as { invoice_number: string } | undefined
  let seq = 1
  if (row?.invoice_number) {
    const last = row.invoice_number.split('-').pop()
    const n = parseInt(last ?? '0', 10)
    if (Number.isFinite(n)) seq = n + 1
  }
  return `${prefix}${String(seq).padStart(4, '0')}`
}

function computeDiscount(
  subtotal: number,
  discountType: 'percentage' | 'fixed' | null | undefined,
  discountValue: number | undefined,
): number {
  const v = discountValue ?? 0
  if (subtotal <= 0 || v <= 0) return 0
  if (discountType === 'fixed') return Math.min(v, subtotal)
  if (discountType === 'percentage') return Math.min(subtotal * (v / 100), subtotal)
  return 0
}

/**
 * Replace invoice lines and recompute totals. Validates job_part_id rows belong to jobCardId.
 * @param taxMode — 'full' uses tax/discount from options; 'simple' stores subtotal as total with zero tax (legacy create without wizard payload).
 */
function replaceInvoiceLinesAndTotals(
  db: ReturnType<typeof getDb>,
  invoiceId: number,
  jobCardId: number,
  jobTaxRate: number | null,
  lines: JobInvoiceLineInput[],
  options: {
    taxMode: 'full' | 'simple'
    tax_rate?: number
    discount_type?: 'percentage' | 'fixed' | null
    discount_value?: number
    notes?: string | null
    payment_terms?: string | null
    include_inspection_on_invoice?: number
  },
): void {
  if (!lines.length) {
    throw new Error('Invoice must have at least one line')
  }

  for (const raw of lines) {
    const pid = raw.job_part_id != null ? Number(raw.job_part_id) : null
    if (pid != null) {
      const row = db
        .prepare(`SELECT id FROM job_parts WHERE job_card_id = ? AND id = ?`)
        .get(jobCardId, pid) as { id: number } | undefined
      if (!row) throw new Error('Invalid job line reference on invoice')
    }
    const unit = Number(raw.unit_price) || 0
    if (unit <= 0) throw new Error('Each line needs unit price greater than 0')
  }

  db.prepare(`DELETE FROM job_invoice_items WHERE job_invoice_id = ?`).run(invoiceId)
  const insertItem = db.prepare(`
    INSERT INTO job_invoice_items (job_invoice_id, description, quantity, unit_price, total_price, service_catalog_id, default_unit_price, custom_unit_price, job_part_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let subtotal = 0
  for (const raw of lines) {
    const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1))
    const unit = Number(raw.unit_price) || 0
    const desc = (raw.description ?? '').trim() || 'Line item'
    const lineTotal = qty * unit
    subtotal += lineTotal
    const defSnap = raw.default_unit_price != null ? Number(raw.default_unit_price) : unit
    const custom = raw.default_unit_price != null && Math.abs(unit - defSnap) > 1e-6 ? unit : null
    const jpid = raw.job_part_id != null ? Number(raw.job_part_id) : null
    insertItem.run(
      invoiceId,
      desc,
      qty,
      unit,
      lineTotal,
      raw.service_catalog_id ?? null,
      defSnap,
      custom,
      jpid,
    )
  }

  let totalAmount: number
  let effectiveTaxRate: number
  let effectiveTaxAmount: number
  let effectiveDiscType: 'percentage' | 'fixed' | null
  let effectiveDiscVal: number

  if (options.taxMode === 'simple') {
    totalAmount = subtotal
    effectiveTaxRate = 0
    effectiveTaxAmount = 0
    effectiveDiscType = null
    effectiveDiscVal = 0
  } else {
    const taxRatePct =
      options.tax_rate !== undefined ? Number(options.tax_rate) || 0 : Number(jobTaxRate ?? 0) || 0
    const discType = options.discount_type ?? null
    const discVal = options.discount_value ?? 0
    const discountAmount = computeDiscount(subtotal, discType, discVal)
    const taxable = Math.max(0, subtotal - discountAmount)
    const taxAmount = taxable * (taxRatePct / 100)
    totalAmount = taxable + taxAmount
    effectiveTaxRate = taxRatePct
    effectiveTaxAmount = taxAmount
    effectiveDiscType = discType
    effectiveDiscVal = discVal
  }

  db.prepare(`
    UPDATE job_invoices SET
      total_amount = ?,
      subtotal = ?,
      tax_rate = ?,
      tax_amount = ?,
      discount_type = ?,
      discount_value = ?,
      notes = ?,
      payment_terms = ?,
      status = 'draft'
    WHERE id = ?
  `).run(
    totalAmount,
    subtotal,
    effectiveTaxRate,
    effectiveTaxAmount,
    effectiveDiscType,
    effectiveDiscVal,
    options.notes ?? null,
    options.payment_terms ?? null,
    invoiceId,
  )

  if (options.include_inspection_on_invoice !== undefined) {
    db.prepare(`UPDATE job_invoices SET include_inspection_on_invoice = ? WHERE id = ?`).run(
      options.include_inspection_on_invoice,
      invoiceId,
    )
  }

  warrantyRepo.regenerateAutoWarrantiesFromProducts(jobCardId, invoiceId)
}

export interface JobInvoiceListRow {
  id: number
  job_card_id: number
  invoice_number: string
  created_at: string
  total_amount: number
  status: string
  customer_name: string | null
  car: string | null
  department: string | null
}

export const jobInvoiceRepo = {
  /**
   * All job-linked draft invoices for the unified Invoices screen (merged with POS sales & custom receipts).
   */
  listAllForInvoicesPage(filters?: { search?: string }): JobInvoiceListRow[] {
    const db = getDb()
    const search = filters?.search?.trim()
    const conditions: string[] = []
    const params: unknown[] = []
    if (search) {
      conditions.push(`(
        ji.invoice_number LIKE ? OR c.name LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR v.license_plate LIKE ?
      )`)
      const like = `%${search}%`
      params.push(like, like, like, like, like)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return db.prepare(`
      SELECT
        ji.id,
        ji.job_card_id,
        ji.invoice_number,
        ji.created_at,
        ji.total_amount,
        ji.status,
        c.name AS customer_name,
        trim(
          COALESCE(CAST(v.year AS TEXT), '') || ' ' ||
          COALESCE(v.make, '') || ' ' || COALESCE(v.model, '')
        ) AS car,
        j.department AS department
      FROM job_invoices ji
      JOIN job_cards j ON j.id = ji.job_card_id
      LEFT JOIN customers c ON ji.owner_id = c.id
      LEFT JOIN vehicles v ON ji.vehicle_id = v.id
      ${where}
      ORDER BY datetime(ji.created_at) DESC
    `).all(...params) as JobInvoiceListRow[]
  },

  deleteById(id: number): void {
    getDb().prepare(`DELETE FROM job_invoices WHERE id = ?`).run(id)
  },

  /** Toggle whether this job invoice’s printout includes the car inspection diagram (uses job inspection data). */
  patchIncludeInspectionOnInvoice(invoiceId: number, include: boolean): void {
    getDb()
      .prepare(`UPDATE job_invoices SET include_inspection_on_invoice = ? WHERE id = ?`)
      .run(include ? 1 : 0, invoiceId)
  },

  getByJobId(jobCardId: number): (JobInvoiceRow & { items: JobInvoiceItemRow[] }) | null {
    const db = getDb()
    const inv = db.prepare(`
      SELECT ji.*, j.job_number AS job_number, j.inspection_data AS inspection_data
      FROM job_invoices ji
      JOIN job_cards j ON j.id = ji.job_card_id
      WHERE ji.job_card_id = ?
    `).get(jobCardId) as JobInvoiceRow | undefined
    if (!inv) return null
    const items = db.prepare(`SELECT * FROM job_invoice_items WHERE job_invoice_id = ? ORDER BY id`).all(inv.id) as JobInvoiceItemRow[]
    return { ...inv, items }
  },

  getById(id: number): (JobInvoiceRow & { items: JobInvoiceItemRow[] }) | null {
    const db = getDb()
    const inv = db.prepare(`
      SELECT ji.*, j.job_number AS job_number, j.inspection_data AS inspection_data
      FROM job_invoices ji
      JOIN job_cards j ON j.id = ji.job_card_id
      WHERE ji.id = ?
    `).get(id) as JobInvoiceRow | undefined
    if (!inv) return null
    const items = db.prepare(`SELECT * FROM job_invoice_items WHERE job_invoice_id = ? ORDER BY id`).all(inv.id) as JobInvoiceItemRow[]
    return { ...inv, items }
  },

  /**
   * Creates or replaces draft invoice lines from job_parts.
   * Without payload: all parts, no tax/discount breakdown (totals = sum of lines).
   * With payload: selected/edited lines + tax/discount/notes.
   */
  createFromJob(jobCardId: number, payload?: CreateJobInvoicePayload | null): { id: number; invoice_number: string } {
    const db = getDb()
    const job = db.prepare(`
      SELECT id, owner_id, vehicle_id, tax_rate,
        COALESCE(invoice_include_inspection, 0) AS invoice_include_inspection
      FROM job_cards WHERE id = ?
    `).get(jobCardId) as {
      id: number
      owner_id: number | null
      vehicle_id: number | null
      tax_rate: number | null
      invoice_include_inspection: number
    } | undefined
    if (!job || job.owner_id == null || job.vehicle_id == null) {
      throw new Error('Job must have customer and vehicle before generating an invoice')
    }

    let lineInputs: JobInvoiceLineInput[]

    if (payload?.items?.length) {
      lineInputs = payload.items.map(it => ({
        job_part_id: it.job_part_id ?? null,
        description: (it.description ?? '').trim() || 'Line item',
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        unit_price: Number(it.unit_price) || 0,
        service_catalog_id: it.service_catalog_id ?? null,
        default_unit_price: it.default_unit_price ?? null,
      }))
    } else {
      let partRows: JobPartRow[]
      if (payload?.parts?.length) {
        const ids = payload.parts.map(p => p.job_part_id)
        if (new Set(ids).size !== ids.length) {
          throw new Error('Duplicate line items')
        }
        const placeholders = payload.parts.map(() => '?').join(',')
        const rows = db.prepare(`
          SELECT id, description, quantity, unit_price, total, service_catalog_id, default_unit_price, cost_price
          FROM job_parts WHERE job_card_id = ? AND id IN (${placeholders})
        `).all(jobCardId, ...ids) as JobPartRow[]
        if (rows.length !== ids.length) {
          throw new Error('One or more line items are invalid for this job')
        }
        const byId = new Map(rows.map(r => [r.id, r]))
        partRows = payload.parts.map(line => {
          const base = byId.get(line.job_part_id)
          if (!base) throw new Error('Invalid job line')
          const qty = Math.max(1, Math.floor(line.quantity || 1))
          const unit = Number(line.unit_price) || 0
          return {
            ...base,
            quantity: qty,
            unit_price: unit,
            total: qty * unit,
          }
        })
      } else {
        partRows = db.prepare(`
          SELECT id, description, quantity, unit_price, total, service_catalog_id, default_unit_price, cost_price
          FROM job_parts WHERE job_card_id = ?
        `).all(jobCardId) as JobPartRow[]
      }

      if (!partRows.length) {
        throw new Error('Add at least one job line item before generating an invoice')
      }

      lineInputs = partRows.map(p => ({
        job_part_id: p.id,
        description: (p.description ?? '').trim() || 'Line item',
        quantity: Math.max(1, p.quantity || 1),
        unit_price: p.unit_price || 0,
        service_catalog_id: p.service_catalog_id ?? null,
        default_unit_price: p.default_unit_price != null ? p.default_unit_price : p.unit_price,
      }))
    }

    if (!lineInputs.length) {
      throw new Error('Add at least one invoice line')
    }

    const existing = db.prepare(`SELECT id FROM job_invoices WHERE job_card_id = ?`).get(jobCardId) as { id: number } | undefined

    let includeInspection: number
    if (payload?.include_inspection_on_invoice !== undefined) {
      includeInspection = payload.include_inspection_on_invoice ? 1 : 0
    } else if (existing) {
      const cur = db
        .prepare(`SELECT COALESCE(include_inspection_on_invoice, 0) AS v FROM job_invoices WHERE id = ?`)
        .get(existing.id) as { v: number }
      includeInspection = Number(cur.v) ? 1 : 0
    } else {
      includeInspection = Number(job.invoice_include_inspection) ? 1 : 0
    }

    let invoiceId: number
    let invoiceNumber: string

    if (existing) {
      invoiceId = existing.id
      const row = db.prepare(`SELECT invoice_number FROM job_invoices WHERE id = ?`).get(invoiceId) as { invoice_number: string }
      invoiceNumber = row.invoice_number
    } else {
      invoiceNumber = nextInvoiceNumber(db)
      const ins = db.prepare(`
        INSERT INTO job_invoices (job_card_id, owner_id, vehicle_id, invoice_number, total_amount, status, include_inspection_on_invoice)
        VALUES (?, ?, ?, ?, ?, 'draft', ?)
      `).run(jobCardId, job.owner_id, job.vehicle_id, invoiceNumber, 0, includeInspection)
      invoiceId = ins.lastInsertRowid as number
    }

    replaceInvoiceLinesAndTotals(db, invoiceId, jobCardId, job.tax_rate, lineInputs, {
      taxMode: payload ? 'full' : 'simple',
      tax_rate: payload?.tax_rate,
      discount_type: payload?.discount_type,
      discount_value: payload?.discount_value,
      notes: payload?.notes ?? null,
      payment_terms: payload?.payment_terms ?? null,
      include_inspection_on_invoice: includeInspection,
    })

    return { id: invoiceId, invoice_number: invoiceNumber }
  },

  /**
   * Replace draft invoice lines and totals (owner / invoices.edit). Only status `draft` is editable.
   */
  updateDraftInvoice(invoiceId: number, payload: UpdateJobInvoicePayload): { id: number; invoice_number: string } {
    const db = getDb()
    const inv = db.prepare(`SELECT * FROM job_invoices WHERE id = ?`).get(invoiceId) as JobInvoiceRow | undefined
    if (!inv) {
      throw new Error('Invoice not found')
    }
    if (inv.status !== 'draft') {
      throw new Error('Only draft invoices can be edited')
    }
    const job = db
      .prepare(`SELECT id, tax_rate FROM job_cards WHERE id = ?`)
      .get(inv.job_card_id) as { id: number; tax_rate: number | null } | undefined
    if (!job) throw new Error('Job not found')

    const incl =
      payload.include_inspection_on_invoice !== undefined
        ? (payload.include_inspection_on_invoice ? 1 : 0)
        : undefined

    replaceInvoiceLinesAndTotals(db, invoiceId, inv.job_card_id, job.tax_rate, payload.items, {
      taxMode: 'full',
      tax_rate: payload.tax_rate,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      notes: payload.notes ?? null,
      payment_terms: payload.payment_terms ?? null,
      ...(incl !== undefined ? { include_inspection_on_invoice: incl } : {}),
    })

    return { id: invoiceId, invoice_number: inv.invoice_number }
  },
}
