import Modal from '../shared/Modal'
import { Zap, ClipboardList } from 'lucide-react'

export default function JobCreationChooserModal(props: {
  open: boolean
  onClose: () => void
  onQuick: () => void
  onFull: () => void
}): JSX.Element | null {
  const { open, onClose, onQuick, onFull } = props
  return (
    <Modal
      open={open}
      title="Create new job"
      onClose={onClose}
      size="lg"
      footer={
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
          Cancel
        </button>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        Choose how you want to log this job. You can always add line items and details later.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onQuick}
          className="text-left rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 p-5 transition shadow-sm hover:shadow-md"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Quick create</span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary text-primary-foreground ml-auto">
              ~30 sec
            </span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Customer + vehicle only</li>
            <li>Appears on the board immediately</li>
            <li>Fill in parts &amp; pricing when you have time</li>
          </ul>
        </button>
        <button
          type="button"
          onClick={onFull}
          className="text-left rounded-xl border border-border hover:bg-muted/50 p-5 transition shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-foreground">Full create</span>
            <span className="text-[10px] text-muted-foreground ml-auto">~5 min</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>All tabs: job lines, progress, customer, car</li>
            <li>Best when details are ready now</li>
            <li>Marked complete when saved</li>
          </ul>
        </button>
      </div>
    </Modal>
  )
}
