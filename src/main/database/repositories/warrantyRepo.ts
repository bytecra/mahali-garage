import { getDb } from '../index'

export interface WarrantyTemplateRow {
  id: number
  name: string
  scope: 'invoice' | 'line' | 'service'
  duration_months: number | null
  service_catalog_id: number | null
  notes: string | null
  sort_order: number
  is_active: number
  created_at: string
}

export interface JobInvoiceWarrantyRow {
  id: number
  job_invoice_id: number
  scope: 'invoice' | 'line' | 'service'
  job_part_id: number | null
  job_invoice_item_id: number | null
  warranty_template_id: number | null
  service_catalog_id: number | null
  /** When set, this row was generated from the linked inventory product’s default warranty. */
  auto_from_product_id: number | null
  title: string
  duration_months: number | null
  effective_date: string
  expiry_date: string | null
  notes: string | null
  created_at: string
}

export interface WarrantyReplaceInput {
  scope: 'invoice' | 'line' | 'service'
  job_part_id?: number | null
  warranty_template_id?: number | null
  service_catalog_id?: number | null
  title: string
  duration_months?: number | null
  effective_date: string
  expiry_date?: string | null
  notes?: string | null
}

function assertInvoiceBelongsToJob(db: ReturnType<typeof getDb>, invoiceId: number, jobCardId: number): void {
  const r = db
    .prepare(`SELECT id FROM job_invoices WHERE id = ? AND job_card_id = ?`)
    .get(invoiceId, jobCardId) as { id: number } | undefined
  if (!r) throw new Error('Invoice does not belong to this job')
}

function assertJobPart(
  db: ReturnType<typeof getDb>,
  jobCardId: number,
  jobPartId: number | null | undefined,
): void {
  if (jobPartId == null) return
  const row = db
    .prepare(`SELECT id FROM job_parts WHERE id = ? AND job_card_id = ?`)
    .get(jobPartId, jobCardId) as { id: number } | undefined
  if (!row) throw new Error('Invalid job line for warranty')
}

function addMonthsIso(isoDate: string, months: number): string | null {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function syncItemIdsForInvoiceDb(db: ReturnType<typeof getDb>, invoiceId: number): void {
  const items = db
    .prepare(`SELECT id, job_part_id FROM job_invoice_items WHERE job_invoice_id = ? AND job_part_id IS NOT NULL`)
    .all(invoiceId) as Array<{ id: number; job_part_id: number }>
  const byPart = new Map(items.map(r => [r.job_part_id, r.id]))
  const warranties = db
    .prepare(`SELECT id, job_part_id FROM job_invoice_warranties WHERE job_invoice_id = ? AND job_part_id IS NOT NULL`)
    .all(invoiceId) as Array<{ id: number; job_part_id: number }>
  const upd = db.prepare(`UPDATE job_invoice_warranties SET job_invoice_item_id = ? WHERE id = ?`)
  for (const w of warranties) {
    const itemId = byPart.get(w.job_part_id)
    if (itemId != null) upd.run(itemId, w.id)
  }
}

export const warrantyRepo = {
  listTemplates(activeOnly = true): WarrantyTemplateRow[] {
    const db = getDb()
    const where = activeOnly ? 'WHERE is_active = 1' : ''
    return db
      .prepare(`SELECT * FROM warranty_templates ${where} ORDER BY sort_order ASC, name ASC`)
      .all() as WarrantyTemplateRow[]
  },

  createTemplate(data: {
    name: string
    scope: 'invoice' | 'line' | 'service'
    duration_months?: number | null
    service_catalog_id?: number | null
    notes?: string | null
    sort_order?: number
  }): number {
    const db = getDb()
    const r = db
      .prepare(`
      INSERT INTO warranty_templates (name, scope, duration_months, service_catalog_id, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .run(
        data.name.trim(),
        data.scope,
        data.duration_months ?? null,
        data.service_catalog_id ?? null,
        data.notes?.trim() ?? null,
        data.sort_order ?? 0,
      )
    return r.lastInsertRowid as number
  },

  updateTemplate(
    id: number,
    data: Partial<Pick<WarrantyTemplateRow, 'name' | 'scope' | 'duration_months' | 'service_catalog_id' | 'notes' | 'sort_order' | 'is_active'>>,
  ): void {
    const db = getDb()
    const entries = Object.entries(data).filter(([, v]) => v !== undefined)
    if (!entries.length) return
    const sets = entries.map(([k]) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE warranty_templates SET ${sets} WHERE id = ?`).run(...entries.map(([, v]) => v), id)
  },

  deleteTemplate(id: number): void {
    getDb().prepare(`DELETE FROM warranty_templates WHERE id = ?`).run(id)
  },

  listByInvoiceId(invoiceId: number): JobInvoiceWarrantyRow[] {
    return getDb()
      .prepare(`SELECT * FROM job_invoice_warranties WHERE job_invoice_id = ? ORDER BY id`)
      .all(invoiceId) as JobInvoiceWarrantyRow[]
  },

  listByJobCardId(jobCardId: number): JobInvoiceWarrantyRow[] {
    return getDb()
      .prepare(
        `
      SELECT w.* FROM job_invoice_warranties w
      INNER JOIN job_invoices ji ON ji.id = w.job_invoice_id
      WHERE ji.job_card_id = ?
      ORDER BY w.id
    `,
      )
      .all(jobCardId) as JobInvoiceWarrantyRow[]
  },

  /** Warranties for a job with invoice number and optional job line label for UI. */
  listByJobCardWithMeta(jobCardId: number): Array<
    JobInvoiceWarrantyRow & { invoice_number: string; line_label: string | null }
  > {
    return getDb()
      .prepare(
        `
      SELECT w.*, ji.invoice_number,
        (SELECT description FROM job_parts jp WHERE jp.id = w.job_part_id) AS line_label
      FROM job_invoice_warranties w
      INNER JOIN job_invoices ji ON ji.id = w.job_invoice_id
      WHERE ji.job_card_id = ?
      ORDER BY w.id
    `,
      )
      .all(jobCardId) as Array<JobInvoiceWarrantyRow & { invoice_number: string; line_label: string | null }>
  },

  /**
   * Replace **manual** warranty rows only (templates / typed-in). Does not remove inventory auto rows.
   * Call {@link regenerateAutoWarrantiesFromProducts} after invoice lines change.
   */
  replaceManualWarrantiesForInvoice(jobCardId: number, invoiceId: number, rows: WarrantyReplaceInput[]): void {
    const db = getDb()
    assertInvoiceBelongsToJob(db, invoiceId, jobCardId)

    for (const raw of rows) {
      assertJobPart(db, jobCardId, raw.job_part_id)
      if (raw.scope === 'line' && raw.job_part_id == null) {
        throw new Error('Line warranty requires a job line')
      }
      if (raw.scope === 'invoice' && raw.job_part_id != null) {
        throw new Error('Invoice-wide warranty cannot reference a job line')
      }
      if (raw.scope === 'service' && raw.service_catalog_id == null && raw.job_part_id == null) {
        throw new Error('Service warranty needs a catalog service or a job line')
      }
    }

    const del = db.prepare(
      `DELETE FROM job_invoice_warranties WHERE job_invoice_id = ? AND auto_from_product_id IS NULL`,
    )
    const ins = db.prepare(`
      INSERT INTO job_invoice_warranties (
        job_invoice_id, scope, job_part_id, job_invoice_item_id, warranty_template_id, service_catalog_id,
        title, duration_months, effective_date, expiry_date, notes, auto_from_product_id
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL)
    `)

    const tx = db.transaction(() => {
      del.run(invoiceId)
      for (const raw of rows) {
        const title = (raw.title ?? '').trim() || 'Warranty'
        ins.run(
          invoiceId,
          raw.scope,
          raw.job_part_id ?? null,
          raw.warranty_template_id ?? null,
          raw.service_catalog_id ?? null,
          title,
          raw.duration_months ?? null,
          raw.effective_date,
          raw.expiry_date ?? null,
          raw.notes?.trim() ?? null,
        )
      }
    })
    tx()
    syncItemIdsForInvoiceDb(db, invoiceId)
  },

  /**
   * Remove orphaned dismissals, drop prior auto rows, then insert one line warranty per invoice line
   * whose job part links to a product with `warranty_title` set, unless the user dismissed that pair.
   */
  regenerateAutoWarrantiesFromProducts(jobCardId: number, invoiceId: number): void {
    const db = getDb()
    assertInvoiceBelongsToJob(db, invoiceId, jobCardId)

    const pruneDismissals = db.prepare(`
      DELETE FROM job_invoice_auto_warranty_dismissals
      WHERE job_invoice_id = ?
        AND job_part_id NOT IN (
          SELECT job_part_id FROM job_invoice_items
          WHERE job_invoice_id = ? AND job_part_id IS NOT NULL
        )
    `)

    const delAuto = db.prepare(
      `DELETE FROM job_invoice_warranties WHERE job_invoice_id = ? AND auto_from_product_id IS NOT NULL`,
    )

    const candidates = db
      .prepare(
        `
      SELECT jii.id AS item_id, jp.id AS job_part_id, p.id AS product_id,
        trim(p.warranty_title) AS warranty_title,
        p.warranty_duration_months AS warranty_duration_months,
        p.warranty_notes AS warranty_notes
      FROM job_invoice_items jii
      INNER JOIN job_parts jp ON jp.id = jii.job_part_id AND jp.job_card_id = ?
      INNER JOIN products p ON p.id = jp.product_id
      WHERE jii.job_invoice_id = ?
        AND p.warranty_title IS NOT NULL AND trim(p.warranty_title) != ''
    `,
      )
      .all(jobCardId, invoiceId) as Array<{
      item_id: number
      job_part_id: number
      product_id: number
      warranty_title: string
      warranty_duration_months: number | null
      warranty_notes: string | null
    }>

    const isDismissed = db.prepare(`
      SELECT 1 FROM job_invoice_auto_warranty_dismissals
      WHERE job_invoice_id = ? AND job_part_id = ? AND product_id = ?
    `)

    const ins = db.prepare(`
      INSERT INTO job_invoice_warranties (
        job_invoice_id, scope, job_part_id, job_invoice_item_id, warranty_template_id, service_catalog_id,
        title, duration_months, effective_date, expiry_date, notes, auto_from_product_id
      ) VALUES (?, 'line', ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `)

    const tx = db.transaction(() => {
      pruneDismissals.run(invoiceId, invoiceId)
      delAuto.run(invoiceId)
      const effective = new Date().toISOString().slice(0, 10)
      for (const c of candidates) {
        if (isDismissed.get(invoiceId, c.job_part_id, c.product_id)) continue
        const months = c.warranty_duration_months != null ? Number(c.warranty_duration_months) : NaN
        const expiry =
          Number.isFinite(months) && months > 0 ? addMonthsIso(effective, months) : null
        ins.run(
          invoiceId,
          c.job_part_id,
          c.warranty_title.trim() || 'Warranty',
          Number.isFinite(months) && months > 0 ? months : null,
          effective,
          expiry,
          c.warranty_notes?.trim() ?? null,
          c.product_id,
        )
      }
    })
    tx()
    syncItemIdsForInvoiceDb(db, invoiceId)
  },

  /** User removed an auto-generated inventory warranty on the draft invoice; do not re-add until line changes clear dismissals. */
  dismissAutoWarranty(jobCardId: number, invoiceId: number, warrantyId: number): void {
    const db = getDb()
    const inv = db
      .prepare(`SELECT id, status, job_card_id FROM job_invoices WHERE id = ?`)
      .get(invoiceId) as { id: number; status: string; job_card_id: number } | undefined
    if (!inv || inv.job_card_id !== jobCardId) throw new Error('Invoice not found')
    if (inv.status !== 'draft') throw new Error('Only draft invoices can be edited')

    const w = db
      .prepare(`SELECT * FROM job_invoice_warranties WHERE id = ? AND job_invoice_id = ?`)
      .get(warrantyId, invoiceId) as JobInvoiceWarrantyRow | undefined
    if (!w) throw new Error('Warranty not found')
    const pid = w.auto_from_product_id
    if (pid == null) throw new Error('Only inventory auto-warranties can be dismissed this way')
    const jpid = w.job_part_id
    if (jpid == null) throw new Error('Invalid warranty row')

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM job_invoice_warranties WHERE id = ?`).run(warrantyId)
      db.prepare(`
        INSERT OR IGNORE INTO job_invoice_auto_warranty_dismissals (job_invoice_id, job_part_id, product_id)
        VALUES (?, ?, ?)
      `).run(invoiceId, jpid, pid)
    })
    tx()
  },

  /** After invoice lines are rebuilt, optionally attach item_id for display (best-effort). */
  syncItemIdsForInvoice(invoiceId: number): void {
    syncItemIdsForInvoiceDb(getDb(), invoiceId)
  },
}
