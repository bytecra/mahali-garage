import { useEffect, useMemo, useState } from 'react'
import { useAnyPermission } from '../../../hooks/usePermission'
import CurrencyText from '../../shared/CurrencyText'
import AddCarModal from '../sub-modals/AddCarModal'
import type { VehicleOption } from './vehicleOption'

export type { VehicleOption } from './vehicleOption'

type JobWarrantyRow = {
  id: number
  scope: string
  title: string
  effective_date: string
  expiry_date: string | null
  invoice_number: string
  line_label: string | null
}

export default function CarTab(props: {
  jobCardId?: number | null
  /** Bump when invoice/log/attachments change so warranty list reloads */
  warrantyRefreshKey?: number
  customerId: number | null
  allVehicles: VehicleOption[]
  selectedVehicle: VehicleOption | null
  onSelectVehicle: (v: VehicleOption | null) => void
  /** After plate/color/etc. are saved on the vehicle record from this tab */
  onVehicleUpdated?: (v: VehicleOption) => void
  /** Full wizard: lines, tax, warranties. Preferred over quick-generate when provided. */
  onOpenInvoiceWizard?: () => void
  /** Quick path without wizard (no warranty UI). Used when parent does not supply onOpenInvoiceWizard. */
  onGenerateInvoice: () => void
  invoiceLoading: boolean
  canGenerateInvoice: boolean
  showInvoiceActions?: boolean
  showLinkedInvoiceSummary?: boolean
  showWarranties?: boolean
  linkedJobInvoice?: { id?: number; invoice_number: string; total_amount: number; status: string } | null
  onViewInvoiceInList?: (invoiceNumber: string) => void
}): JSX.Element {
  const {
    jobCardId,
    warrantyRefreshKey = 0,
    customerId,
    allVehicles,
    selectedVehicle,
    onSelectVehicle,
    onVehicleUpdated,
    onOpenInvoiceWizard,
    onGenerateInvoice,
    invoiceLoading,
    canGenerateInvoice,
    showInvoiceActions = true,
    showLinkedInvoiceSummary = true,
    showWarranties = true,
    linkedJobInvoice,
    onViewInvoiceInList,
  } = props

  const canEditVehicle = useAnyPermission(['customers.edit', 'repairs.edit'])
  const [addOpen, setAddOpen] = useState(false)
  const [vehicleToEdit, setVehicleToEdit] = useState<VehicleOption | null>(null)
  const [jobWarranties, setJobWarranties] = useState<JobWarrantyRow[]>([])
  const [warrantyLoading, setWarrantyLoading] = useState(false)

  useEffect(() => {
    if (!jobCardId || !linkedJobInvoice?.invoice_number) {
      setJobWarranties([])
      return
    }
    let cancelled = false
    setWarrantyLoading(true)
    void window.electronAPI.jobCards.listWarrantiesForJob(jobCardId).then(res => {
      if (cancelled) return
      setWarrantyLoading(false)
      if (res.success && Array.isArray(res.data)) {
        setJobWarranties(res.data as JobWarrantyRow[])
      } else {
        setJobWarranties([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [jobCardId, linkedJobInvoice?.invoice_number, linkedJobInvoice?.total_amount, warrantyRefreshKey])

  const filtered = useMemo(
    () => (customerId ? allVehicles.filter(v => v.owner_id === customerId) : []),
    [allVehicles, customerId],
  )

  const invoiceIsDraft = !linkedJobInvoice || linkedJobInvoice.status === 'draft'

  return (
    <div className="space-y-4">
      {!customerId && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-6 text-center">
          Select a customer in the Customer tab first.
        </p>
      )}

      {customerId && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Vehicle</label>
            <select
              value={selectedVehicle?.id ?? ''}
              onChange={e => {
                const id = e.target.value
                if (!id) {
                  onSelectVehicle(null)
                  return
                }
                const v = filtered.find(x => x.id === Number(id))
                if (v) onSelectVehicle(v)
              }}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            >
              <option value="">— Select vehicle —</option>
              {filtered.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} {v.year ?? ''} {v.license_plate ? `· ${v.license_plate}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              Add new vehicle
            </button>
            {canEditVehicle && selectedVehicle && (
              <button
                type="button"
                onClick={() => setVehicleToEdit(selectedVehicle)}
                className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Edit vehicle details
              </button>
            )}
          </div>
          {canEditVehicle && selectedVehicle && (
            <p className="text-xs text-muted-foreground">
              Plate, color, mileage, and VIN are edited in the window that opens—then save there.
            </p>
          )}

          {selectedVehicle && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Make / Model:</span> {selectedVehicle.make} {selectedVehicle.model}</div>
              <div><span className="text-muted-foreground">Year:</span> {selectedVehicle.year ?? '—'}</div>
              <div><span className="text-muted-foreground">Plate:</span> {selectedVehicle.license_plate ?? '—'}</div>
              <div><span className="text-muted-foreground">Color:</span> {selectedVehicle.color?.trim() ? selectedVehicle.color : '—'}</div>
              <div className="sm:col-span-2"><span className="text-muted-foreground">VIN:</span> <span className="font-mono text-xs">{selectedVehicle.vin ?? '—'}</span></div>
            </div>
          )}

          {showLinkedInvoiceSummary && linkedJobInvoice && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm space-y-2">
              <p className="font-medium text-emerald-800 dark:text-emerald-200">Invoice created</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                <span>
                  <span className="text-foreground font-mono font-semibold">{linkedJobInvoice.invoice_number}</span>
                </span>
                <span>
                  Total: <CurrencyText amount={linkedJobInvoice.total_amount} className="font-medium text-foreground" />
                </span>
                <span className="capitalize">Status: {linkedJobInvoice.status}</span>
              </div>
              {onViewInvoiceInList && (
                <button
                  type="button"
                  onClick={() => onViewInvoiceInList(linkedJobInvoice.invoice_number)}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  View in Invoices →
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                You can generate again to refresh draft lines from the current job items.
              </p>
            </div>
          )}

          {showWarranties && linkedJobInvoice && jobCardId && (
            <div className="rounded-lg border border-border bg-muted/10 px-3 py-3 text-sm space-y-2">
              <p className="font-medium">Warranties (this job)</p>
              {warrantyLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : jobWarranties.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No warranties yet. Use <strong className="font-medium text-foreground">Edit invoice & warranties</strong> above (draft invoice only).
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {jobWarranties.map(w => (
                    <li key={w.id} className="border border-border/60 rounded-md px-2 py-1.5 bg-background/80">
                      <span className="font-medium">{w.title}</span>
                      <span className="text-muted-foreground ms-1">({w.scope})</span>
                      {w.line_label ? (
                        <span className="block text-muted-foreground truncate">Line: {w.line_label}</span>
                      ) : null}
                      <span className="block text-muted-foreground">
                        {w.invoice_number} · {w.effective_date}
                        {w.expiry_date ? ` → ${w.expiry_date}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {showInvoiceActions && (
            <div className="pt-4 border-t border-border space-y-2">
              {onOpenInvoiceWizard ? (
                <>
                  <button
                    type="button"
                    disabled={!canGenerateInvoice || !invoiceIsDraft}
                    onClick={onOpenInvoiceWizard}
                    className="w-full sm:w-auto px-6 py-3 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {linkedJobInvoice
                      ? invoiceIsDraft
                        ? 'Edit invoice & warranties'
                        : 'Invoice locked'
                      : 'Invoice wizard'}
                  </button>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Opens the invoice wizard where you can set lines, tax, and <strong className="font-medium text-foreground">warranties</strong>.
                    {linkedJobInvoice && !invoiceIsDraft
                      ? ' This invoice is no longer a draft, so it cannot be changed here.'
                      : null}
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!canGenerateInvoice || invoiceLoading}
                  onClick={onGenerateInvoice}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {invoiceLoading ? 'Generating…' : 'Generate invoice'}
                </button>
              )}
              {!onOpenInvoiceWizard && !canGenerateInvoice && (
                <p className="text-xs text-muted-foreground mt-2">
                  Requires a saved job with customer, vehicle, and at least one line item.
                </p>
              )}
              {onOpenInvoiceWizard && !canGenerateInvoice && (
                <p className="text-xs text-muted-foreground mt-2">
                  Requires a saved job with customer, vehicle, and at least one line item.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <AddCarModal
        open={addOpen || vehicleToEdit != null}
        ownerId={customerId}
        vehicleToEdit={vehicleToEdit}
        onClose={() => {
          setAddOpen(false)
          setVehicleToEdit(null)
        }}
        onSaved={v => {
          if (vehicleToEdit) {
            onVehicleUpdated?.(v)
            setVehicleToEdit(null)
          } else {
            onSelectVehicle(v)
            setAddOpen(false)
          }
        }}
      />
    </div>
  )
}
