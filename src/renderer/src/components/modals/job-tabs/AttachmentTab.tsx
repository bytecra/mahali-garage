import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Paperclip, Pencil, Save, Trash2, ExternalLink, FolderOpen } from 'lucide-react'
import { toast } from '../../../store/notificationStore'
import ConfirmDialog from '../../shared/ConfirmDialog'

type AttachmentRow = {
  id: number
  name: string
  file_name: string
  file_size: number
  created_at: string
  uploaded_by_name?: string | null
}

function bytesToBase64(bytes: number[]): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.slice(i, i + chunk)
    binary += String.fromCharCode(...part)
  }
  return btoa(binary)
}

function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function defaultNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '').trim()
  return base || fileName
}

export default function AttachmentTab(props: {
  jobCardId: number | null
  /** Bump parent Log tab refresh after add / edit / delete */
  onMutate?: () => void
}): JSX.Element {
  const { jobCardId, onMutate } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<AttachmentRow[]>([])
  const [name, setName] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const load = useCallback(async () => {
    if (!jobCardId) return
    setLoading(true)
    try {
      const res = await window.electronAPI.jobCards.listAttachments(jobCardId)
      if (res.success && Array.isArray(res.data)) setRows(res.data as AttachmentRow[])
      else setRows([])
    } finally {
      setLoading(false)
    }
  }, [jobCardId])

  useEffect(() => {
    void load()
  }, [load])

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPendingFile(f)
    setName(prev => (prev.trim() ? prev : defaultNameFromFileName(f.name)))
  }

  const pickFromElectronDialog = async (): Promise<void> => {
    const picked = await window.electronAPI.employees.chooseFile()
    if (!picked.success) {
      toast.error((picked as { error?: string }).error ?? 'Could not open file picker')
      return
    }
    if (!picked.data) return
    const file = picked.data as { fileName: string; fileBuffer: number[]; mimeType?: string }
    const blob = new Blob([new Uint8Array(file.fileBuffer)], { type: file.mimeType ?? 'application/octet-stream' })
    const f = new File([blob], file.fileName, { type: file.mimeType })
    setPendingFile(f)
    setName(prev => (prev.trim() ? prev : defaultNameFromFileName(file.fileName)))
  }

  const addAttachment = async (): Promise<void> => {
    if (!jobCardId) return
    if (!pendingFile) {
      toast.error('Choose a file from your PC first (Browse from PC).')
      return
    }
    const trimmed = name.trim() || defaultNameFromFileName(pendingFile.name)
    setUploading(true)
    try {
      const buf = new Uint8Array(await pendingFile.arrayBuffer())
      const b64 = bytesToBase64(Array.from(buf))
      const res = await window.electronAPI.jobCards.addAttachment(jobCardId, {
        name: trimmed,
        file_name: pendingFile.name,
        file_data: b64,
        mime_type: pendingFile.type || null,
      })
      setUploading(false)
      if (!res.success) {
        toast.error(res.error ?? 'Failed to add attachment')
        return
      }
      setName('')
      setPendingFile(null)
      toast.success('Attachment added')
      onMutate?.()
      void load()
    } catch {
      setUploading(false)
      toast.error('Failed to add attachment')
    }
  }

  const saveEdit = async (): Promise<void> => {
    if (editId == null) return
    const trimmed = editName.trim()
    if (!trimmed) return
    const res = await window.electronAPI.jobCards.updateAttachment(editId, { name: trimmed })
    if (!res.success) {
      toast.error(res.error ?? 'Failed to update')
      return
    }
    setEditId(null)
    setEditName('')
    toast.success('Attachment updated')
    onMutate?.()
    void load()
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    const res = await window.electronAPI.jobCards.deleteAttachment(id)
    if (!res.success) {
      toast.error(res.error ?? 'Failed to delete')
      return
    }
    setDeleteTarget(null)
    toast.success('Attachment deleted')
    onMutate?.()
    void load()
  }

  if (!jobCardId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Save the job first to manage attachments.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3 bg-muted/10 space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileInputChange}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted inline-flex items-center gap-1.5"
          >
            <FolderOpen className="w-4 h-4" />
            Browse from PC
          </button>
          <button
            type="button"
            onClick={() => void pickFromElectronDialog()}
            disabled={uploading}
            className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted inline-flex items-center gap-1.5"
            title="Alternative picker (PDF and common images)"
          >
            System dialog…
          </button>
        </div>
        {pendingFile && (
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-mono text-foreground">{pendingFile.name}</span>
            {' '}({fmtSize(pendingFile.size)})
          </p>
        )}
        <div>
          <label className="block text-sm font-medium mb-2">Display name (optional)</label>
          <div className="flex gap-2 flex-wrap">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Defaults to file name — edit if you want"
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-input rounded-md bg-background"
            />
            <button
              type="button"
              onClick={() => void addAttachment()}
              disabled={uploading || !pendingFile}
              className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <Paperclip className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Add attachment'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Pick a file first, then optional rename, then click Add attachment.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 bg-muted/10 min-h-[220px]">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading attachments...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="rounded-md border border-border bg-background p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {editId === r.id ? (
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-input rounded-md bg-background"
                      />
                    ) : (
                      <p className="font-medium text-foreground truncate">{r.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {r.file_name} • {fmtSize(Number(r.file_size) || 0)} • {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void window.electronAPI.jobCards.openAttachment(r.id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Open"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    {editId === r.id ? (
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Save name"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(r.id)
                          setEditName(r.name)
                        }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Edit name"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete attachment?"
        message={
          deleteTarget
            ? `Remove “${deleteTarget.name}” from this job? The stored file will be permanently deleted.`
            : ''
        }
        confirmLabel="Delete attachment"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
