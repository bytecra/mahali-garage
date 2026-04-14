import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from '../../../store/notificationStore'

export type WarrantyTemplateLite = {
  id: number
  name: string
  scope: 'invoice' | 'line' | 'service'
  duration_months: number | null
  service_catalog_id: number | null
  notes: string | null
}

export type InvoiceWarrantyDraft = {
  key: string
  /** Server row id when loaded from DB */
  id?: number
  /** Generated from inventory product default warranty */
  isFromProduct?: boolean
  scope: 'invoice' | 'line' | 'service'
  job_part_id: number | null
  service_catalog_id: number | null
  warranty_template_id: number | null
  title: string
  duration_months: string
  effective_date: string
  expiry_date: string
  notes: string
}

type DraftLine = {
  lineKey: string
  job_part_id: number | null
  description: string
  service_catalog_id: number | null
}

function newKey(): string {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyWarrantyDraft(effectiveDate: string): InvoiceWarrantyDraft {
  return {
    key: newKey(),
    scope: 'invoice',
    job_part_id: null,
    service_catalog_id: null,
    warranty_template_id: null,
    title: '',
    duration_months: '',
    effective_date: effectiveDate,
    expiry_date: '',
    notes: '',
  }
}

function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function InvoiceWarrantyEditor(props: {
  draftLines: DraftLine[]
  templates: WarrantyTemplateLite[]
  rows: InvoiceWarrantyDraft[]
  onChange: (rows: InvoiceWarrantyDraft[]) => void
  defaultEffectiveDate: string
  /** Required to remove inventory auto-warranties before the invoice is re-saved */
  jobCardId?: number | null
  invoiceId?: number | null
}): JSX.Element {
  const { t } = useTranslation()
  const { draftLines, templates, rows, onChange, defaultEffectiveDate, jobCardId, invoiceId } = props

  const lineOptions = useMemo(
    () =>
      draftLines.filter(l => l.job_part_id != null).map(l => ({
        job_part_id: l.job_part_id as number,
        label: (l.description || 'Line').slice(0, 80),
        catalogId: l.service_catalog_id,
      })),
    [draftLines],
  )

  const applyTemplate = (rowKey: string, templateId: string): void => {
    const tid = Number(templateId)
    if (!Number.isFinite(tid)) return
    const t = templates.find(x => x.id === tid)
    if (!t) return
    onChange(
      rows.map(r => {
        if (r.key !== rowKey) return r
        if (r.isFromProduct) return r
        let scope = t.scope
        let jobPart: number | null = r.job_part_id
        let svc = t.service_catalog_id ?? r.service_catalog_id
        if (scope === 'line' && jobPart == null && lineOptions[0]) {
          jobPart = lineOptions[0].job_part_id
        }
        if (scope === 'service' && svc == null && lineOptions[0]?.catalogId) {
          svc = lineOptions[0].catalogId
        }
        const months = t.duration_months != null ? String(t.duration_months) : ''
        const exp =
          months && r.effective_date
            ? addMonthsIso(r.effective_date, Number(months) || 0)
            : r.expiry_date
        return {
          ...r,
          scope,
          job_part_id: jobPart,
          service_catalog_id: svc,
          warranty_template_id: t.id,
          title: t.name,
          duration_months: months,
          notes: t.notes ?? r.notes,
          expiry_date: exp,
        }
      }),
    )
  }

  const updateRow = (key: string, patch: Partial<InvoiceWarrantyDraft>): void => {
    onChange(
      rows.map(r => {
        if (r.key !== key) return r
        if (r.isFromProduct) return r
        const next = { ...r, ...patch }
        if (patch.duration_months !== undefined || patch.effective_date !== undefined) {
          const m = Number(next.duration_months)
          if (Number.isFinite(m) && m > 0 && next.effective_date) {
            next.expiry_date = addMonthsIso(next.effective_date, m)
          }
        }
        return next
      }),
    )
  }

  const removeRow = async (key: string): Promise<void> => {
    const row = rows.find(r => r.key === key)
    if (row?.isFromProduct && row.id != null && jobCardId != null && invoiceId != null) {
      const res = await window.electronAPI.jobCards.dismissJobInvoiceAutoWarranty(jobCardId, invoiceId, row.id)
      if (!res.success) {
        toast.error(res.error ?? t('common.error'))
        return
      }
    }
    onChange(rows.filter(r => r.key !== key))
  }

  const addRow = (): void => {
    onChange([...rows, emptyWarrantyDraft(defaultEffectiveDate)])
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{t('invoice.warrantiesSection')}</p>
          <p className="text-xs text-muted-foreground">
            {t('invoice.warrantyEditorHelp')}
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
        >
          <Plus className="w-3.5 h-3.5" /> {t('invoice.addWarranty')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('invoice.noWarranties')}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.key} className="rounded-md border border-border/80 bg-background p-3 space-y-2 text-xs">
              <div className="flex flex-wrap gap-2 items-end">
                {row.isFromProduct ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {t('inventory.warrantyFromProductBadge')}
                  </span>
                ) : null}
                {templates.length > 0 && !row.isFromProduct ? (
                  <div className="min-w-[140px]">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Template</label>
                    <select
                      className="w-full border border-input rounded px-2 py-1 bg-background"
                      value=""
                      onChange={e => {
                        applyTemplate(row.key, e.target.value)
                        e.target.value = ''
                      }}
                    >
                      <option value="">{t('invoice.applyTemplate')}</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="min-w-[100px]">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Scope</label>
                  <select
                    className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                    value={row.scope}
                    disabled={Boolean(row.isFromProduct)}
                    onChange={e => {
                      const scope = e.target.value as InvoiceWarrantyDraft['scope']
                      updateRow(row.key, {
                        scope,
                        job_part_id: scope === 'invoice' || scope === 'service' ? null : row.job_part_id,
                      })
                    }}
                  >
                    <option value="invoice">Whole invoice</option>
                    <option value="line">Job line</option>
                    <option value="service">Service / catalog</option>
                  </select>
                </div>
                {row.scope === 'line' ? (
                  <div className="min-w-[160px] flex-1">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Line</label>
                    <select
                      className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                      value={row.job_part_id ?? ''}
                      disabled={Boolean(row.isFromProduct)}
                      onChange={e => {
                        const v = e.target.value
                        updateRow(row.key, {
                          job_part_id: v ? Number(v) : null,
                        })
                      }}
                    >
                      <option value="">Select line…</option>
                      {lineOptions.map(o => (
                        <option key={o.job_part_id} value={o.job_part_id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {row.scope === 'service' ? (
                  <div className="min-w-[140px] flex-1">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Catalog ID (optional)</label>
                    <input
                      className="w-full border border-input rounded px-2 py-1 bg-background font-mono disabled:opacity-60"
                      placeholder="Service catalog #"
                      value={row.service_catalog_id ?? ''}
                      disabled={Boolean(row.isFromProduct)}
                      onChange={e => {
                        const v = e.target.value.trim()
                        updateRow(row.key, {
                          service_catalog_id: v ? Number(v) : null,
                        })
                      }}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeRow(row.key)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive ms-auto"
                  aria-label="Remove warranty"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Title *</label>
                  <input
                    className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                    value={row.title}
                    disabled={Boolean(row.isFromProduct)}
                    onChange={e => updateRow(row.key, { title: e.target.value })}
                    placeholder="e.g. Parts & labor 12 months"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Duration (months)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                    value={row.duration_months}
                    disabled={Boolean(row.isFromProduct)}
                    onChange={e => updateRow(row.key, { duration_months: e.target.value })}
                    placeholder="12"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Start</label>
                  <input
                    type="date"
                    className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                    value={row.effective_date}
                    disabled={Boolean(row.isFromProduct)}
                    onChange={e => updateRow(row.key, { effective_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">End</label>
                  <input
                    type="date"
                    className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                    value={row.expiry_date}
                    disabled={Boolean(row.isFromProduct)}
                    onChange={e => updateRow(row.key, { expiry_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Notes</label>
                <input
                  className="w-full border border-input rounded px-2 py-1 bg-background disabled:opacity-60"
                  value={row.notes}
                  disabled={Boolean(row.isFromProduct)}
                  onChange={e => updateRow(row.key, { notes: e.target.value })}
                  placeholder="Coverage details, exclusions…"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function warrantyDraftsToPayload(rows: InvoiceWarrantyDraft[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const r of rows) {
    if (r.isFromProduct) continue
    const title = r.title.trim()
    if (!title) continue
    const duration_months = r.duration_months.trim() ? Number(r.duration_months) : null
    out.push({
      scope: r.scope,
      job_part_id: r.job_part_id,
      warranty_template_id: r.warranty_template_id,
      service_catalog_id: r.service_catalog_id,
      title,
      duration_months: duration_months != null && Number.isFinite(duration_months) ? duration_months : null,
      effective_date: r.effective_date || new Date().toISOString().slice(0, 10),
      expiry_date: r.expiry_date.trim() || null,
      notes: r.notes.trim() || null,
    })
  }
  return out
}

export function rowsFromServer(
  serverRows: Array<Record<string, unknown>>,
  effectiveDefault: string,
): InvoiceWarrantyDraft[] {
  return serverRows.map(sr => {
    const autoPid = sr.auto_from_product_id != null ? Number(sr.auto_from_product_id) : null
    const isFromProduct = autoPid != null && Number.isFinite(autoPid)
    return {
      key: newKey(),
      id: sr.id != null ? Number(sr.id) : undefined,
      isFromProduct: Boolean(isFromProduct),
      scope: (sr.scope as InvoiceWarrantyDraft['scope']) || 'invoice',
      job_part_id: sr.job_part_id != null ? Number(sr.job_part_id) : null,
      service_catalog_id: sr.service_catalog_id != null ? Number(sr.service_catalog_id) : null,
      warranty_template_id: sr.warranty_template_id != null ? Number(sr.warranty_template_id) : null,
      title: String(sr.title ?? ''),
      duration_months: sr.duration_months != null ? String(sr.duration_months) : '',
      effective_date: String(sr.effective_date ?? effectiveDefault).slice(0, 10),
      expiry_date: sr.expiry_date != null ? String(sr.expiry_date).slice(0, 10) : '',
      notes: sr.notes != null ? String(sr.notes) : '',
    }
  })
}
