import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, RefreshCw, X } from 'lucide-react'
import type { BuybackRow, BuybackCreateInput } from '../../types/electron'
import { toast } from '../../store/notificationStore'
import { useCurrencyStore } from '../../store/currencyStore'

function fmtMoney(symbol: string, amount: number): string {
  return `${symbol}${amount.toFixed(2)}`
}

const STATUS_LABELS: Record<string, string> = {
  received:     'Received',
  inspecting:   'Inspecting',
  refurbishing: 'Refurbishing',
  ready:        'Ready',
  sold:         'Sold',
  scrapped:     'Scrapped',
}
const STATUS_COLORS: Record<string, string> = {
  received:     'bg-blue-500/20 text-blue-400',
  inspecting:   'bg-yellow-500/20 text-yellow-400',
  refurbishing: 'bg-purple-500/20 text-purple-400',
  ready:        'bg-green-500/20 text-green-400',
  sold:         'bg-primary/20 text-primary',
  scrapped:     'bg-muted text-muted-foreground',
}
const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', broken: 'text-red-400',
}

const NEXT_STATUS: Record<string, string> = {
  received: 'inspecting',
  inspecting: 'refurbishing',
  refurbishing: 'ready',
}

function NewBuybackModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const [form, setForm] = useState<BuybackCreateInput>({
    device_type: '',
    brand: '',
    model: '',
    serial_number: '',
    condition_grade: 'C',
    buyback_price: 0,
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof BuybackCreateInput, v: unknown): void =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = async (): Promise<void> => {
    if (!form.device_type.trim()) { toast.error('Device type is required'); return }
    setSaving(true)
    try {
      const res = await window.electronAPI.buybacks.create({
        ...form,
        brand: form.brand || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        notes: form.notes || null,
      })
      if (res.success) { toast.success('Buyback recorded'); onCreated(); onClose() }
      else toast.error(res.error ?? 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Record Buyback</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Device Type *</label>
              <input value={form.device_type} onChange={e => set('device_type', e.target.value)}
                placeholder="e.g. PlayStation 5, Gaming PC…"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Brand</label>
              <input value={form.brand ?? ''} onChange={e => set('brand', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Model</label>
              <input value={form.model ?? ''} onChange={e => set('model', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Serial Number</label>
              <input value={form.serial_number ?? ''} onChange={e => set('serial_number', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Condition</label>
              <select value={form.condition_grade} onChange={e => set('condition_grade', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background">
                <option value="A">A — Excellent</option>
                <option value="B">B — Good</option>
                <option value="C">C — Fair</option>
                <option value="D">D — Poor</option>
                <option value="broken">Broken</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Buyback Price</label>
              <input type="number" value={form.buyback_price ?? 0} min="0"
                onChange={e => set('buyback_price', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void handleSave()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Record Buyback'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BuybacksPage(): JSX.Element {
  const { symbol } = useCurrencyStore()
  const fmt = (n: number): string => fmtMoney(symbol, n)
  const [rows, setRows] = useState<BuybackRow[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.buybacks.list({
        search: search || undefined,
        status: (statusFilter || undefined) as BuybackRow['status'] | undefined,
        pageSize: 50,
      })
      if (res.success && res.data) { setRows(res.data.items); setTotal(res.data.total) }
    } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => { void load() }, [load])

  const advanceStatus = async (row: BuybackRow): Promise<void> => {
    const next = NEXT_STATUS[row.status]
    if (!next) return
    const res = await window.electronAPI.buybacks.update(row.id, { status: next as BuybackRow['status'] })
    if (res.success) { toast.success(`Status → ${STATUS_LABELS[next]}`); void load() }
    else toast.error(res.error ?? 'Failed')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Buybacks</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Used devices purchased from customers — track inspection, refurbishment and resale</p>
        </div>
        <button type="button" onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md">
          <Plus className="w-4 h-4" /> Record Buyback
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="search" placeholder="Search device, brand, serial…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Device</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Grade</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Paid</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Resale</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <RefreshCw className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No buybacks recorded yet</p>
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.device_type}</p>
                  <p className="text-xs text-muted-foreground">{[r.brand, r.model].filter(Boolean).join(' ') || '—'}</p>
                  {r.serial_number && <p className="text-xs text-muted-foreground font-mono">{r.serial_number}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.customer_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`font-bold text-sm ${GRADE_COLORS[r.condition_grade] ?? ''}`}>{r.condition_grade}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmt(r.buyback_price)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.resale_price != null ? fmt(r.resale_price) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  {NEXT_STATUS[r.status] && (
                    <button type="button" onClick={() => void advanceStatus(r)}
                      className="text-xs text-primary hover:underline whitespace-nowrap">
                      → {STATUS_LABELS[NEXT_STATUS[r.status]]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > rows.length && <p className="text-xs text-muted-foreground text-center">Showing {rows.length} of {total}</p>}

      {showNew && <NewBuybackModal onClose={() => setShowNew(false)} onCreated={() => void load()} />}
    </div>
  )
}
