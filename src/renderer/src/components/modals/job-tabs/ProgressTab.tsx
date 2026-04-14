import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { toast } from '../../../store/notificationStore'

export interface ProgressComment {
  id: number
  user_id: number
  comment: string
  created_at: string
  user_name?: string
}

export default function ProgressTab(props: {
  jobCardId: number | null
}): JSX.Element {
  const { jobCardId } = props
  const user = useAuthStore(s => s.user)
  const [comments, setComments] = useState<ProgressComment[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!jobCardId) return
    setLoading(true)
    try {
      const res = await window.electronAPI.jobCards.listProgressComments(jobCardId)
      if (res.success && Array.isArray(res.data)) setComments(res.data as ProgressComment[])
      else setComments([])
    } finally {
      setLoading(false)
    }
  }, [jobCardId])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (): Promise<void> => {
    if (!jobCardId) return
    const t = text.trim()
    if (!t) {
      toast.error('Enter a comment')
      return
    }
    setSubmitting(true)
    try {
      const res = await window.electronAPI.jobCards.addProgressComment(jobCardId, t)
      setSubmitting(false)
      if (!res.success) {
        toast.error((res as { error?: string }).error ?? 'Failed')
        return
      }
      setText('')
      void load()
    } catch {
      setSubmitting(false)
      toast.error('Failed to add comment')
    }
  }

  const remove = async (id: number, authorId: number): Promise<void> => {
    if (!user) return
    const ok =
      user.userId === authorId || user.role === 'owner' || user.role === 'manager'
    if (!ok) {
      toast.error('You can only delete your own comments (or as owner/manager).')
      return
    }
    const res = await window.electronAPI.jobCards.deleteProgressComment(id)
    if (!res.success) {
      toast.error((res as { error?: string }).error ?? 'Failed')
      return
    }
    void load()
  }

  if (!jobCardId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Save the job first to add progress comments and view history.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-h-[min(60vh,520px)]">
      <div className="flex-1 overflow-y-auto space-y-3 rounded-lg border border-border p-3 bg-muted/10 min-h-[200px]">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No comments yet.</p>
        ) : (
          comments.map(c => {
            const canDel =
              user &&
              (user.userId === c.user_id || user.role === 'owner' || user.role === 'manager')
            return (
              <div key={c.id} className="rounded-md border border-border/80 bg-background px-3 py-2 text-sm">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <span className="font-medium text-foreground">{c.user_name ?? 'User'}</span>
                    <span className="text-xs text-muted-foreground ms-2 tabular-nums">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  {canDel && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => void remove(c.id, c.user_id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-foreground whitespace-pre-wrap">{c.comment}</p>
              </div>
            )
          })
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">New comment</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
          placeholder="Add an update for the team…"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="mt-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Post comment'}
        </button>
      </div>
    </div>
  )
}
