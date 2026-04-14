import { CheckCircle2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { formatCurrency, formatDateTime } from '../../lib/utils'
import { printJobInvoiceDraft, type JobInvoicePrintSnapshot } from '../../lib/printJobInvoiceDraft'
import { toast } from '../../store/notificationStore'

export interface InvoiceCreatedPayload {
  id: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  customer_name: string
  vehicle_label: string
  job_number?: string | null
  items: Array<{ description: string; quantity: number; unit_price: number; total_price: number }>
  subtotal?: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  discount_type?: string | null
  discount_value?: number | null
  notes?: string | null
  payment_terms?: string | null
  inspection_data?: string | null
  include_inspection_on_invoice?: number | null
}

export default function InvoiceCreatedModal(props: {
  open: boolean
  data: InvoiceCreatedPayload | null
  storeName?: string
  onClose: () => void
  onViewInInvoices: () => void
}): JSX.Element | null {
  const { open, data, storeName, onClose, onViewInInvoices } = props
  if (!data) return null

  const handlePrint = (): void => {
    const snap: JobInvoicePrintSnapshot = {
      storeName,
      invoice_number: data.invoice_number,
      created_at: data.created_at,
      status: data.status,
      customer_name: data.customer_name,
      vehicle_label: data.vehicle_label,
      job_number: data.job_number,
      items: data.items,
      total_amount: data.total_amount,
      subtotal: data.subtotal,
      tax_rate: data.tax_rate,
      tax_amount: data.tax_amount,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      notes: data.notes,
      payment_terms: data.payment_terms,
      inspection_data: data.inspection_data,
      include_inspection_on_invoice: data.include_inspection_on_invoice,
    }
    void printJobInvoiceDraft(snap).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    })
  }

  return (
    <Modal
      open={open}
      title=""
      onClose={onClose}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onViewInInvoices}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            View invoice →
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2 text-[#00a854] dark:text-emerald-400">
          <CheckCircle2 className="w-8 h-8 shrink-0" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Invoice created successfully</h2>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Invoice #</span>
            <span className="font-mono font-semibold text-end">{data.invoice_number}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Customer</span>
            <span className="text-end">{data.customer_name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Vehicle</span>
            <span className="text-end">{data.vehicle_label}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-end">{formatCurrency(data.total_amount)} AED</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            <span className="capitalize text-end">{data.status}</span>
          </div>
          <div className="flex justify-between gap-4 text-xs pt-1 border-t border-border/80">
            <span className="text-muted-foreground">Created</span>
            <span className="text-end">{formatDateTime(data.created_at)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
