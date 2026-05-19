import { type Dispatch, type SetStateAction } from 'react'
import CarInspectionPanel from '../../inspection/CarInspectionPanel'
import type { InspectionMarker, InspectionMarkerType } from '../../inspection/carInspectionTypes'

export default function CarInspectionTab(props: {
  showInspection: boolean
  setShowInspection: Dispatch<SetStateAction<boolean>>
  inspectionMarkers: InspectionMarker[]
  setInspectionMarkers: Dispatch<SetStateAction<InspectionMarker[]>>
  inspectionNotes: string
  setInspectionNotes: Dispatch<SetStateAction<string>>
  selectedMarkerType: InspectionMarkerType
  setSelectedMarkerType: Dispatch<SetStateAction<InspectionMarkerType>>
  showInspectionOnInvoice: boolean
  onShowInspectionOnInvoiceChange: (value: boolean) => void | Promise<void>
  /** Job already has a draft/final job invoice — flag is stored on that invoice row */
  hasJobInvoice: boolean
}): JSX.Element {
  return (
    <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto pe-1">
      <p className="text-sm text-muted-foreground">
        Mark damage on the vehicle diagram. This is stored on the job and uses the same layout as custom receipts.
      </p>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex items-start gap-2.5 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={props.showInspectionOnInvoice}
            onChange={e => void props.onShowInspectionOnInvoiceChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary shrink-0"
          />
          <span>
            <span className="font-medium text-foreground leading-tight block">
              Include car inspection diagram on the printed job invoice
            </span>
            <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
              {props.hasJobInvoice
                ? 'Stored on this job’s invoice — applies when you print from Invoices or after creating the invoice here.'
                : 'Stored on the job for now; when you generate the job invoice, this choice is copied to that invoice.'}
            </span>
          </span>
        </label>
      </div>
      <CarInspectionPanel
        showInspection={props.showInspection}
        setShowInspection={props.setShowInspection}
        inspectionMarkers={props.inspectionMarkers}
        setInspectionMarkers={props.setInspectionMarkers}
        inspectionNotes={props.inspectionNotes}
        setInspectionNotes={props.setInspectionNotes}
        selectedMarkerType={props.selectedMarkerType}
        setSelectedMarkerType={props.setSelectedMarkerType}
      />
    </div>
  )
}
