import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { toast } from '../../store/notificationStore'

interface Draft { id: number; sale_number: string; total_amount: number; item_count: number; updated_at: string }
interface Props { onLoad: (draftId: number) => void; trigger: number }

export default function DraftInvoices({ onLoad, trigger }: Props): JSX.Element {
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<Draft[]>([])

  const load = async () => {
    const res = await window.electronAPI.sales.getDrafts()
    if (res.success) setDrafts(res.data as Draft[])
  }

  useEffect(() => { load() }, [trigger])

  const deleteDraft = async (id: number) => {
    const res = await window.electronAPI.sales.deleteDraft(id)
    if (res.success) { toast.success(t('common.success')); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  if (drafts.length === 0) return (
    <div className="text-center py-4 text-muted-foreground text-xs">{t('pos.noDrafts')}</div>
  )

  return (
    <div className="space-y-1.5">
      {drafts.map(d => (
        <div key={d.id} className="flex items-center gap-2 bg-muted/30 rounded-md px-3 py-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono truncate">{d.sale_number}</p>
            <p className="text-xs text-muted-foreground">{d.item_count} items · {formatCurrency(d.total_amount)} · {formatDate(d.updated_at)}</p>
          </div>
          <button onClick={() => onLoad(d.id)} className="text-xs text-primary hover:underline shrink-0">{t('common.load')}</button>
          <button onClick={() => deleteDraft(d.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  )
}
