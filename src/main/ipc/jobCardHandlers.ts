import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { jobCardRepo } from '../database/repositories/jobCardRepo'
import { jobProgressRepo } from '../database/repositories/jobProgressRepo'
import { getDb } from '../database'
import {
  jobInvoiceRepo,
  type CreateJobInvoicePayload,
  type UpdateJobInvoicePayload,
} from '../database/repositories/jobInvoiceRepo'
import { authService } from '../services/authService'
import { activityLogRepo } from '../database/repositories/activityLogRepo'
import { hasFeature } from '../licensing/license-manager'
import { ok, err } from '../utils/ipcResponse'
import log from '../utils/logger'
import { warrantyRepo, type WarrantyReplaceInput } from '../database/repositories/warrantyRepo'

const jobAttachmentDir = path.join(app.getPath('userData'), 'store', 'job-attachments')
fs.mkdirSync(jobAttachmentDir, { recursive: true })

function uniqueAttachmentName(originalName: string): string {
  const ext = path.extname(originalName)
  const base = path.basename(originalName, ext) || 'attachment'
  const safe = base.replace(/[^\w\-.\s]/g, '_').trim() || 'attachment'
  const first = `${safe}${ext}`
  if (!fs.existsSync(path.join(jobAttachmentDir, first))) return first
  return `${safe}_${Date.now()}${ext}`
}

function isAttachmentPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  const base = path.resolve(jobAttachmentDir)
  return resolved === base || resolved.startsWith(base + path.sep)
}

function idOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function vehicleLabelFromBeforeJobRow(before: Record<string, unknown>): string {
  const make = before.vehicle_make != null ? String(before.vehicle_make).trim() : ''
  const model = before.vehicle_model != null ? String(before.vehicle_model).trim() : ''
  const mm = [make, model].filter(Boolean).join(' ').trim()
  const plate = before.vehicle_plate != null ? String(before.vehicle_plate).trim() : ''
  if (mm && plate) return `${mm} · ${plate}`
  if (mm) return mm
  if (plate) return plate
  const vid = idOrNull(before.vehicle_id)
  return vid != null ? `Vehicle #${vid}` : '—'
}

function fetchVehicleLabelById(vehicleId: number): string {
  const r = getDb()
    .prepare(`SELECT make, model, license_plate FROM vehicles WHERE id = ?`)
    .get(vehicleId) as { make: string | null; model: string | null; license_plate: string | null } | undefined
  if (!r) return `Vehicle #${vehicleId}`
  const mm = [r.make, r.model].filter(Boolean).join(' ').trim()
  const p = r.license_plate != null ? String(r.license_plate).trim() : ''
  if (mm && p) return `${mm} · ${p}`
  if (mm) return mm
  if (p) return p
  return `Vehicle #${vehicleId}`
}

function fetchCustomerNameById(customerId: number | null): string {
  if (customerId == null) return '—'
  const r = getDb().prepare(`SELECT name FROM customers WHERE id = ?`).get(customerId) as
    | { name: string | null }
    | undefined
  const n = r?.name != null ? String(r.name).trim() : ''
  return n || `#${customerId}`
}

/** Compare payload to pre-update job row; logs when owner_id or vehicle_id actually change. */
function logJobCardCustomerVehicleChanges(
  userId: number,
  jobCardId: number,
  before: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  if (Object.prototype.hasOwnProperty.call(payload, 'owner_id')) {
    const prev = idOrNull(before.owner_id)
    const next = idOrNull(payload.owner_id)
    if (prev !== next) {
      const fromLabel =
        before.owner_name != null && String(before.owner_name).trim() !== ''
          ? String(before.owner_name).trim()
          : prev != null
            ? `#${prev}`
            : '—'
      const toLabel = fetchCustomerNameById(next)
      activityLogRepo.log({
        userId,
        action: 'job_card.customer_change',
        entity: 'job_card',
        entityId: jobCardId,
        details: JSON.stringify({
          from_id: prev,
          to_id: next,
          from_label: fromLabel,
          to_label: toLabel,
        }),
      })
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'vehicle_id')) {
    const prev = idOrNull(before.vehicle_id)
    const next = idOrNull(payload.vehicle_id)
    if (prev !== next) {
      activityLogRepo.log({
        userId,
        action: 'job_card.vehicle_change',
        entity: 'job_card',
        entityId: jobCardId,
        details: JSON.stringify({
          from_id: prev,
          to_id: next,
          from_label: vehicleLabelFromBeforeJobRow(before),
          to_label: next != null ? fetchVehicleLabelById(next) : '—',
        }),
      })
    }
  }
}

function requireLicense(feature: string): string | null {
  try {
    if (!hasFeature(feature)) return 'This feature requires STANDARD or PREMIUM license'
  } catch (e) {
    log.error('License check error', e)
    return null
  }
  return null
}

/** Job invoice PDF/detail is used from job cards and from the unified Invoices page. */
function requireJobInvoiceLicense(): string | null {
  try {
    if (hasFeature('job_cards.view') || hasFeature('invoices.view')) return null
    return 'This feature requires STANDARD or PREMIUM license'
  } catch (e) {
    log.error('License check error', e)
    return null
  }
}

export function registerJobCardHandlers(): void {
  ipcMain.handle('jobCards:list', (event, filters) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.list(filters))
    } catch (e) { log.error('jobCards:list', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getByStatus', (event, filters?: { profile?: 'all' | 'complete' | 'incomplete' }) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.getByStatus(filters ?? {}))
    } catch (e) { log.error('jobCards:getByStatus', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getById', (event, id: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const card = jobCardRepo.getById(id)
      if (!card) return err('Not found', 'ERR_NOT_FOUND')
      return ok(card)
    } catch (e) { log.error('jobCards:getById', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:create', (event, input) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const result = jobCardRepo.create({ ...input, created_by: session!.userId })
      try {
        activityLogRepo.log({
          userId: session!.userId,
          action: 'job_card.create',
          entity: 'job_card',
          entityId: result.id,
          details: JSON.stringify({ job: result.job_number }),
        })
      } catch { /* non-critical */ }
      return ok(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create job card'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:update', (event, id: number, input) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const before = jobCardRepo.getById(id) as Record<string, unknown> | null
      const updated = jobCardRepo.update(id, input)
      if (updated && session) {
        const payload = (input ?? {}) as Record<string, unknown>
        if (Object.prototype.hasOwnProperty.call(payload, 'archived')) {
          const nextArchived = Number(payload.archived ?? 0) === 1
          activityLogRepo.log({
            userId: session.userId,
            action: nextArchived ? 'job_card.archive' : 'job_card.reactivate',
            entity: 'job_card',
            entityId: id,
            details: JSON.stringify({ job: before?.job_number ?? null }),
          })
        }
        if (before) {
          logJobCardCustomerVehicleChanges(session.userId, id, before, payload)
        }
      }
      return ok(updated)
    } catch (e) { log.error('jobCards:update', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:updateStatus', (event, id: number, status: string) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.updateStatus')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const before = jobCardRepo.getById(id) as Record<string, unknown> | null
      const updated = jobCardRepo.updateStatus(id, status)
      if (updated && session) {
        const fromStatus = String(before?.status ?? '')
        activityLogRepo.log({
          userId: session.userId,
          action: status === 'completed_delivered' ? 'job_card.complete' : 'job_card.status_update',
          entity: 'job_card',
          entityId: id,
          details: JSON.stringify({ from_status: fromStatus, to_status: status }),
        })
      }
      return ok(updated)
    } catch (e) { log.error('jobCards:updateStatus', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:delete', (event, id: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.delete')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.delete(id))
    } catch (e) { log.error('jobCards:delete', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:addPart', (event, jobCardId: number, part) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const id = jobCardRepo.addPart(jobCardId, part)
      if (session) {
        const p = (part ?? {}) as Record<string, unknown>
        const quantity = Number(p.quantity ?? 1) || 1
        const unit = Number(p.unit_price ?? 0) || 0
        activityLogRepo.log({
          userId: session.userId,
          action: 'job_card.cost_add',
          entity: 'job_card',
          entityId: jobCardId,
          details: JSON.stringify({
            description: String(p.description ?? 'Item'),
            amount: quantity * unit,
          }),
        })
      }
      return ok({ id })
    } catch (e) { log.error('jobCards:addPart', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:removePart', (event, partId: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.removePart(partId))
    } catch (e) { log.error('jobCards:removePart', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:getForVehicle', (event, vehicleId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobCardRepo.getForVehicle(vehicleId))
    } catch (e) { log.error('jobCards:getForVehicle', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listProgressComments', (event, jobCardId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobProgressRepo.listByJob(jobCardId))
    } catch (e) { log.error('jobCards:listProgressComments', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:addProgressComment', (event, jobCardId: number, text: string) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_FORBIDDEN')
      const t = String(text ?? '').trim()
      if (!t) return err('Comment is required', 'ERR_VALIDATION')
      const id = jobProgressRepo.create(jobCardId, session.userId, t)
      return ok({ id })
    } catch (e) { log.error('jobCards:addProgressComment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:deleteProgressComment', (event, commentId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_FORBIDDEN')
      const row = jobProgressRepo.getById(commentId)
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      const isOwnerOrManager =
        session.userId === row.user_id || session.role === 'owner' || session.role === 'manager'
      if (!isOwnerOrManager) return err('Forbidden', 'ERR_FORBIDDEN')
      jobProgressRepo.delete(commentId)
      return ok(null)
    } catch (e) { log.error('jobCards:deleteProgressComment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:createJobInvoice', (event, jobCardId: number, payload?: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      let parsed: CreateJobInvoicePayload | undefined
      if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
        const p = payload as Record<string, unknown>
        const partsRaw = p.parts
        const itemsRaw = p.items
        if (Array.isArray(partsRaw) && partsRaw.length === 0 && !(Array.isArray(itemsRaw) && itemsRaw.length > 0)) {
          return err('No items selected for invoice', 'ERR_VALIDATION')
        }
        const meta: CreateJobInvoicePayload = {
          notes: p.notes != null ? String(p.notes) : undefined,
          payment_terms: p.payment_terms != null ? String(p.payment_terms) : null,
          tax_rate: p.tax_rate !== undefined ? Number(p.tax_rate) : undefined,
          discount_type:
            p.discount_type === 'percentage' || p.discount_type === 'fixed' ? p.discount_type : null,
          discount_value: p.discount_value !== undefined ? Number(p.discount_value) : undefined,
          include_inspection_on_invoice:
            p.include_inspection_on_invoice === true
              ? true
              : p.include_inspection_on_invoice === false
                ? false
                : undefined,
        }
        if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
          const items = itemsRaw.map(row => {
            const r = row as Record<string, unknown>
            const jpid = r.job_part_id
            return {
              job_part_id: jpid === null || jpid === undefined ? null : Number(jpid),
              description: String(r.description ?? ''),
              quantity: Number(r.quantity) || 1,
              unit_price: Number(r.unit_price) || 0,
              service_catalog_id: r.service_catalog_id != null ? Number(r.service_catalog_id) : null,
              default_unit_price: r.default_unit_price != null ? Number(r.default_unit_price) : null,
            }
          })
          parsed = { ...meta, items }
        } else if (Array.isArray(partsRaw) && partsRaw.length > 0) {
          const parts = partsRaw.map(row => {
            const r = row as Record<string, unknown>
            return {
              job_part_id: Number(r.job_part_id),
              quantity: Number(r.quantity) || 1,
              unit_price: Number(r.unit_price) || 0,
            }
          })
          const ids = parts.map(x => x.job_part_id)
          if (new Set(ids).size !== ids.length) return err('Duplicate line items', 'ERR_VALIDATION')
          parsed = { ...meta, parts }
        } else if (
          p.tax_rate !== undefined ||
          p.notes !== undefined ||
          p.payment_terms !== undefined ||
          p.discount_type === 'percentage' ||
          p.discount_type === 'fixed' ||
          p.discount_value !== undefined
        ) {
          parsed = meta
        }
      }
      if (parsed?.items?.some(it => it.job_part_id == null)) {
        if (!authService.hasPermission(event.sender.id, 'invoices.edit')) {
          return err('Adding or editing manual invoice lines requires invoice edit permission', 'ERR_FORBIDDEN')
        }
      }
      const session = authService.getSession(event.sender.id)
      const result = jobInvoiceRepo.createFromJob(jobCardId, parsed)
      if (session) {
        activityLogRepo.log({
          userId: session.userId,
          action: 'job_card.invoice_generated',
          entity: 'job_card',
          entityId: jobCardId,
          details: JSON.stringify({ invoice_number: result.invoice_number ?? null }),
        })
      }
      const full = jobInvoiceRepo.getById(result.id)
      return ok(full ?? { ...result, items: [] })
    } catch (e: unknown) {
      log.error('jobCards:createJobInvoice', e)
      const msg = e instanceof Error ? e.message : 'Failed to create invoice'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:getJobInvoice', (event, invoiceId: number) => {
    try {
      const licErr = requireJobInvoiceLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      const sid = event.sender.id
      const can =
        authService.hasPermission(sid, 'repairs.view') || authService.hasPermission(sid, 'invoices.view')
      if (!can) return err('Forbidden', 'ERR_FORBIDDEN')
      const inv = jobInvoiceRepo.getById(invoiceId)
      if (!inv) return err('Not found', 'ERR_NOT_FOUND')
      return ok(inv)
    } catch (e) { log.error('jobCards:getJobInvoice', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:updateJobInvoice', (event, invoiceId: number, payload: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'invoices.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return err('Invalid payload', 'ERR_VALIDATION')
      }
      const p = payload as Record<string, unknown>
      const itemsRaw = p.items
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return err('At least one invoice line is required', 'ERR_VALIDATION')
      }
      const items = itemsRaw.map(row => {
        const r = row as Record<string, unknown>
        const jpid = r.job_part_id
        return {
          job_part_id: jpid === null || jpid === undefined ? null : Number(jpid),
          description: String(r.description ?? ''),
          quantity: Number(r.quantity) || 1,
          unit_price: Number(r.unit_price) || 0,
          service_catalog_id: r.service_catalog_id != null ? Number(r.service_catalog_id) : null,
          default_unit_price: r.default_unit_price != null ? Number(r.default_unit_price) : null,
        }
      })
      const parsed: UpdateJobInvoicePayload = {
        items,
        tax_rate: p.tax_rate !== undefined ? Number(p.tax_rate) : undefined,
        discount_type:
          p.discount_type === 'percentage' || p.discount_type === 'fixed' ? p.discount_type : null,
        discount_value: p.discount_value !== undefined ? Number(p.discount_value) : undefined,
        notes: p.notes != null ? String(p.notes) : null,
        payment_terms: p.payment_terms != null ? String(p.payment_terms) : null,
        include_inspection_on_invoice:
          p.include_inspection_on_invoice === true
            ? true
            : p.include_inspection_on_invoice === false
              ? false
              : undefined,
      }
      const result = jobInvoiceRepo.updateDraftInvoice(invoiceId, parsed)
      const full = jobInvoiceRepo.getById(result.id)
      return ok(full ?? { ...result, items: [] })
    } catch (e: unknown) {
      log.error('jobCards:updateJobInvoice', e)
      const msg = e instanceof Error ? e.message : 'Failed to update invoice'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:patchJobInvoiceInspection', (event, invoiceId: number, include: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const id = Number(invoiceId)
      if (!Number.isFinite(id)) return err('Invalid invoice', 'ERR_VALIDATION')
      jobInvoiceRepo.patchIncludeInspectionOnInvoice(id, include === true)
      const full = jobInvoiceRepo.getById(id)
      return ok(full ?? null)
    } catch (e) {
      log.error('jobCards:patchJobInvoiceInspection', e)
      return err(e instanceof Error ? e.message : 'Failed', 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:getJobInvoiceForJob', (event, jobCardId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobInvoiceRepo.getByJobId(jobCardId))
    } catch (e) { log.error('jobCards:getJobInvoiceForJob', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listJobInvoices', (event, filters?: { search?: string }) => {
    try {
      // Same license scope as getJobInvoice: job cards or invoices feature.
      const licErr = requireJobInvoiceLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      const sid = event.sender.id
      // Unified Invoices page merges POS/custom (sales.view) with job drafts; do not require invoices.view
      // permission so staff who see receipts but lack invoices.view still see job-generated rows.
      const can =
        authService.hasPermission(sid, 'sales.view') ||
        authService.hasPermission(sid, 'invoices.view') ||
        authService.hasPermission(sid, 'repairs.view')
      if (!can) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(jobInvoiceRepo.listAllForInvoicesPage(filters))
    } catch (e) { log.error('jobCards:listJobInvoices', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:deleteJobInvoice', (event, invoiceId: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      jobInvoiceRepo.deleteById(invoiceId)
      return ok(null)
    } catch (e) { log.error('jobCards:deleteJobInvoice', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listAttachments', (event, jobCardId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const rows = getDb().prepare(`
        SELECT a.id, a.job_card_id, a.name, a.file_name, a.file_size, a.mime_type, a.created_at, a.updated_at,
               a.uploaded_by, u.full_name AS uploaded_by_name
        FROM job_attachments a
        LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.job_card_id = ?
        ORDER BY a.created_at DESC
      `).all(jobCardId)
      return ok(rows)
    } catch (e) { log.error('jobCards:listAttachments', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:addAttachment', (event, jobCardId: number, payload: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      if (!session) return err('Unauthorized', 'ERR_FORBIDDEN')
      const p = (payload ?? {}) as Record<string, unknown>
      const name = String(p.name ?? '').trim()
      const fileNameRaw = String(p.file_name ?? '').trim()
      const fileData = String(p.file_data ?? '')
      const mimeType = p.mime_type != null ? String(p.mime_type) : null
      if (!name) return err('Attachment name is required', 'ERR_VALIDATION')
      if (!fileNameRaw) return err('File is required', 'ERR_VALIDATION')
      const buf = Buffer.from(fileData, 'base64')
      if (!buf.length) return err('Invalid file data', 'ERR_VALIDATION')
      const diskName = uniqueAttachmentName(fileNameRaw)
      const fullPath = path.join(jobAttachmentDir, diskName)
      fs.writeFileSync(fullPath, buf)
      const result = getDb().prepare(`
        INSERT INTO job_attachments (job_card_id, name, file_path, file_name, file_size, mime_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(jobCardId, name, fullPath, diskName, buf.length, mimeType, session.userId)
      try {
        activityLogRepo.log({
          userId: session.userId,
          action: 'job_card.attachment_add',
          entity: 'job_card',
          entityId: jobCardId,
          details: JSON.stringify({ attachment_name: name }),
        })
      } catch { /* non-critical */ }
      return ok({ id: Number(result.lastInsertRowid) })
    } catch (e) { log.error('jobCards:addAttachment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:updateAttachment', (event, attachmentId: number, patch: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const p = (patch ?? {}) as Record<string, unknown>
      const name = String(p.name ?? '').trim()
      if (!name) return err('Attachment name is required', 'ERR_VALIDATION')
      const prev = getDb().prepare(
        'SELECT name, job_card_id FROM job_attachments WHERE id = ?',
      ).get(attachmentId) as { name: string; job_card_id: number } | undefined
      if (!prev) return err('Not found', 'ERR_NOT_FOUND')
      getDb().prepare(`
        UPDATE job_attachments
        SET name = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name, attachmentId)
      if (session && prev.name !== name) {
        try {
          activityLogRepo.log({
            userId: session.userId,
            action: 'job_card.attachment_edit',
            entity: 'job_card',
            entityId: prev.job_card_id,
            details: JSON.stringify({ from_name: prev.name, to_name: name }),
          })
        } catch { /* non-critical */ }
      }
      return ok(true)
    } catch (e) { log.error('jobCards:updateAttachment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:deleteAttachment', (event, attachmentId: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const session = authService.getSession(event.sender.id)
      const row = getDb().prepare(
        'SELECT file_path, name, job_card_id FROM job_attachments WHERE id = ?',
      ).get(attachmentId) as
        | { file_path: string; name: string; job_card_id: number }
        | undefined
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      if (session) {
        try {
          activityLogRepo.log({
            userId: session.userId,
            action: 'job_card.attachment_delete',
            entity: 'job_card',
            entityId: row.job_card_id,
            details: JSON.stringify({ attachment_name: row.name }),
          })
        } catch { /* non-critical */ }
      }
      getDb().prepare('DELETE FROM job_attachments WHERE id = ?').run(attachmentId)
      try {
        if (row.file_path && isAttachmentPathSafe(row.file_path) && fs.existsSync(row.file_path)) {
          fs.unlinkSync(row.file_path)
        }
      } catch {
        /* non-fatal */
      }
      return ok(true)
    } catch (e) { log.error('jobCards:deleteAttachment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:openAttachment', (event, attachmentId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const row = getDb().prepare('SELECT file_path FROM job_attachments WHERE id = ?').get(attachmentId) as
        | { file_path: string }
        | undefined
      if (!row) return err('Not found', 'ERR_NOT_FOUND')
      if (!isAttachmentPathSafe(row.file_path)) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!fs.existsSync(row.file_path)) return err('File not found', 'ERR_NOT_FOUND')
      void shell.openPath(row.file_path)
      return ok(true)
    } catch (e) { log.error('jobCards:openAttachment', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listLogs', (event, jobCardId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(activityLogRepo.listByEntity('job_card', jobCardId, 300))
    } catch (e) { log.error('jobCards:listLogs', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listWarrantyTemplates', (event, activeOnly?: unknown) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      const only = activeOnly !== false
      return ok(warrantyRepo.listTemplates(only))
    } catch (e) { log.error('jobCards:listWarrantyTemplates', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:createWarrantyTemplate', (event, data: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = (data ?? {}) as Record<string, unknown>
      const name = String(d.name ?? '').trim()
      if (!name) return err('Name is required', 'ERR_VALIDATION')
      const scope = d.scope === 'line' || d.scope === 'service' ? d.scope : 'invoice'
      const id = warrantyRepo.createTemplate({
        name,
        scope,
        duration_months: d.duration_months != null ? Number(d.duration_months) : null,
        service_catalog_id: d.service_catalog_id != null ? Number(d.service_catalog_id) : null,
        notes: d.notes != null ? String(d.notes) : null,
        sort_order: d.sort_order != null ? Number(d.sort_order) : 0,
      })
      return ok({ id })
    } catch (e) { log.error('jobCards:createWarrantyTemplate', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:updateWarrantyTemplate', (event, id: number, data: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const d = (data ?? {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      if (d.name !== undefined) patch.name = String(d.name).trim()
      if (d.scope !== undefined) {
        patch.scope = d.scope === 'line' || d.scope === 'service' || d.scope === 'invoice' ? d.scope : 'invoice'
      }
      if (d.duration_months !== undefined) patch.duration_months = d.duration_months == null ? null : Number(d.duration_months)
      if (d.service_catalog_id !== undefined) patch.service_catalog_id = d.service_catalog_id == null ? null : Number(d.service_catalog_id)
      if (d.notes !== undefined) patch.notes = d.notes == null ? null : String(d.notes)
      if (d.sort_order !== undefined) patch.sort_order = Number(d.sort_order) || 0
      if (d.is_active !== undefined) patch.is_active = d.is_active ? 1 : 0
      warrantyRepo.updateTemplate(id, patch as Parameters<typeof warrantyRepo.updateTemplate>[1])
      return ok(null)
    } catch (e) { log.error('jobCards:updateWarrantyTemplate', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:deleteWarrantyTemplate', (event, id: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      warrantyRepo.deleteTemplate(id)
      return ok(null)
    } catch (e) { log.error('jobCards:deleteWarrantyTemplate', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listJobInvoiceWarranties', (event, invoiceId: number) => {
    try {
      const licErr = requireJobInvoiceLicense()
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      const sid = event.sender.id
      if (!authService.hasPermission(sid, 'repairs.view') && !authService.hasPermission(sid, 'invoices.view')) {
        return err('Forbidden', 'ERR_FORBIDDEN')
      }
      return ok(warrantyRepo.listByInvoiceId(invoiceId))
    } catch (e) { log.error('jobCards:listJobInvoiceWarranties', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:listWarrantiesForJob', (event, jobCardId: number) => {
    try {
      const licErr = requireLicense('job_cards.view')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.view')) return err('Forbidden', 'ERR_FORBIDDEN')
      return ok(warrantyRepo.listByJobCardWithMeta(jobCardId))
    } catch (e) { log.error('jobCards:listWarrantiesForJob', e); return err('Failed', 'ERR_JOB_CARDS') }
  })

  ipcMain.handle('jobCards:replaceJobInvoiceWarranties', (event, jobCardId: number, invoiceId: number, rows: unknown) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      if (!Array.isArray(rows)) return err('Invalid payload', 'ERR_VALIDATION')
      const invRow = jobInvoiceRepo.getById(invoiceId)
      if (!invRow || invRow.job_card_id !== jobCardId) {
        return err('Invoice not found for this job', 'ERR_NOT_FOUND')
      }
      if (invRow.status !== 'draft') {
        return err('Warranties can only be edited while the invoice is a draft', 'ERR_VALIDATION')
      }
      const parsed: WarrantyReplaceInput[] = rows.map((raw) => {
        const r = raw as Record<string, unknown>
        const scope = r.scope === 'line' || r.scope === 'service' || r.scope === 'invoice' ? r.scope : 'invoice'
        return {
          scope,
          job_part_id: r.job_part_id != null ? Number(r.job_part_id) : null,
          warranty_template_id: r.warranty_template_id != null ? Number(r.warranty_template_id) : null,
          service_catalog_id: r.service_catalog_id != null ? Number(r.service_catalog_id) : null,
          title: String(r.title ?? 'Warranty'),
          duration_months: r.duration_months != null ? Number(r.duration_months) : null,
          effective_date: String(r.effective_date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          expiry_date: r.expiry_date != null && String(r.expiry_date).trim() !== '' ? String(r.expiry_date).slice(0, 10) : null,
          notes: r.notes != null ? String(r.notes) : null,
        }
      })
      warrantyRepo.replaceManualWarrantiesForInvoice(jobCardId, invoiceId, parsed)
      return ok(null)
    } catch (e: unknown) {
      log.error('jobCards:replaceJobInvoiceWarranties', e)
      const msg = e instanceof Error ? e.message : 'Failed'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })

  ipcMain.handle('jobCards:dismissJobInvoiceAutoWarranty', (event, jobCardId: number, invoiceId: number, warrantyId: number) => {
    try {
      const licErr = requireLicense('job_cards.edit')
      if (licErr) return err(licErr, 'ERR_LICENSE_REQUIRED')
      if (!authService.hasPermission(event.sender.id, 'repairs.edit')) return err('Forbidden', 'ERR_FORBIDDEN')
      const invRow = jobInvoiceRepo.getById(invoiceId)
      if (!invRow || invRow.job_card_id !== jobCardId) {
        return err('Invoice not found for this job', 'ERR_NOT_FOUND')
      }
      if (invRow.status !== 'draft') {
        return err('Warranties can only be edited while the invoice is a draft', 'ERR_VALIDATION')
      }
      warrantyRepo.dismissAutoWarranty(jobCardId, invoiceId, warrantyId)
      return ok(null)
    } catch (e: unknown) {
      log.error('jobCards:dismissJobInvoiceAutoWarranty', e)
      const msg = e instanceof Error ? e.message : 'Failed'
      return err(msg, 'ERR_JOB_CARDS')
    }
  })
}
