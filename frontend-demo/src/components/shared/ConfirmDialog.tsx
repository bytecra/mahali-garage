import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
            variant === 'danger' ? 'bg-destructive/10' : 'bg-yellow-100 dark:bg-yellow-950'
          )}>
            <AlertTriangle className={cn(
              'w-5 h-5',
              variant === 'danger' ? 'text-destructive' : 'text-yellow-600'
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-6 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 text-sm rounded-md font-medium transition-colors text-white',
              variant === 'danger'
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-yellow-500 hover:bg-yellow-600'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
