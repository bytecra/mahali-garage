import Modal from '../../shared/Modal'
import { formatCurrency } from '../../../lib/utils'

export interface InvoicePreviewData {
  id: number
  invoice_number: string
  total_amount: number
  status: string
  created_at: string
  items: Array<{ description: string; quantity: number; unit_price: number; total_price: number }>
}

export default function InvoicePreviewModal(props: {
  open: boolean
  data: InvoicePreviewData | null
  onClose: () => void
}): JSX.Element | null {
  const { open, data, onClose } = props
  if (!data) return null

  return (
    <Modal
      open={open}
      title={`Invoice ${data.invoice_number}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
            Close
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-4 text-muted-foreground">
          <span>Status: <span className="text-foreground capitalize">{data.status}</span></span>
          <span>Date: <span className="text-foreground">{new Date(data.created_at).toLocaleString()}</span></span>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-3 py-2 font-medium">Description</th>
                <th className="text-center px-3 py-2 font-medium w-20">Qty</th>
                <th className="text-end px-3 py-2 font-medium w-28">Unit (AED)</th>
                <th className="text-end px-3 py-2 font-medium w-28">Line (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((row, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-muted/20' : ''}>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.quantity}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{formatCurrency(row.unit_price)}</td>
                  <td className="px-3 py-2 text-end tabular-nums font-medium">{formatCurrency(row.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-border pt-3">
          <span className="text-lg font-semibold text-foreground">
            Total: {formatCurrency(data.total_amount)} AED
          </span>
        </div>
      </div>
    </Modal>
  )
}
