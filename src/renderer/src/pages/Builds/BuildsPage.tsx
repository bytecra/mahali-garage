import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Cpu, ChevronRight, X, Check, Ban } from 'lucide-react'
import type { BuildRow, BuildCreateInput } from '../../types/electron'
import { toast } from '../../store/notificationStore'
import { useCurrencyStore } from '../../store/currencyStore'

function fmtMoney(symbol: string, amount: number): string {
  return `${symbol}${amount.toFixed(2)}`
}

const STATUS_LABELS: Record<string, string> = {
  draft:      'Draft',
  reserved:   'Reserved',
  assembling: 'Assembling',
  complete:   'Complete',
  sold:       'Sold',
  cancelled:  'Cancelled',
}
const STATUS_COLORS: Record<string, string> = {
  draft:      'bg-muted text-muted-foreground',
  reserved:   'bg-yellow-500/20 text-yellow-400',
  assembling: 'bg-blue-500/20 text-blue-400',
  complete:   'bg-green-500/20 text-green-400',
  sold:       'bg-primary/20 text-primary',
  cancelled:  'bg-red-500/20 text-red-400',
}

function NewBuildModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Array<{ product_id: string; product_name: string; quantity: string; unit_cost: string }>>([
    { product_id: '', product_name: '', quantity: '1', unit_cost: '0' },
  ])
  const [saving, setSaving] = useState(false)

  const addItem = (): void => setItems(p => [...p, { product_id: '', product_name: '', quantity: '1', unit_cost: '0' }])
  const removeItem = (i: number): void => setItems(p => p.filter((_, idx) => idx !== i))

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) { toast.error('Build name is required'); return }
    const validItems = items.filter(it => it.product_id && it.product_name && Number(it.quantity) > 0)
    if (!validItems.length) { toast.error('Add at least one component'); return }
    setSaving(true)
    try {
      const payload: BuildCreateInput = {
        name: name.trim(),
        sell_price: Number(sellPrice) || 0,
        notes: notes.trim() || null,
        items: validItems.map(it => ({
          product_id: Number(it.product_id),
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
        })),
      }
      const res = await window.electronAPI.builds.create(payload)
      if (res.success) {
        toast.success('Build created')
        onCreated()
        onClose()
      } else {
        toast.error(res.error ?? 'Failed to create build')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">New PC Build</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Build Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gaming Build #1"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sell Price</label>
              <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} min="0"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Components</label>
              <button type="button" onClick={addItem} className="text-xs text-primary hover:underline">+ Add row</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input type="number" placeholder="Product ID" value={item.product_id}
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, product_id: e.target.value } : x))}
                    className="col-span-2 px-2 py-1.5 text-sm border border-input rounded-md bg-background" />
                  <input placeholder="Name" value={item.product_name}
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, product_name: e.target.value } : x))}
                    className="col-span-4 px-2 py-1.5 text-sm border border-input rounded-md bg-background" />
                  <input type="number" placeholder="Qty" value={item.quantity} min="1"
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                    className="col-span-2 px-2 py-1.5 text-sm border border-input rounded-md bg-background" />
                  <input type="number" placeholder="Cost" value={item.unit_cost} min="0"
                    onChange={e => setItems(p => p.map((x, idx) => idx === i ? { ...x, unit_cost: e.target.value } : x))}
                    className="col-span-3 px-2 py-1.5 text-sm border border-input rounded-md bg-background" />
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-muted-foreground hover:text-red-400">
                    <X className="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void handleSave()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Build'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BuildsPage(): JSX.Element {
  const { symbol } = useCurrencyStore()
  const fmt = (n: number): string => fmtMoney(symbol, n)
  const [builds, setBuilds] = useState<BuildRow[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.builds.list({ search, status: statusFilter || undefined, pageSize: 50 })
      if (res.success && res.data) { setBuilds(res.data.items); setTotal(res.data.total) }
    } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => { void load() }, [load])

  const handleAction = async (buildId: number, action: 'reserve' | 'completeAssembly' | 'cancel'): Promise<void> => {
    const labels: Record<string, string> = { reserve: 'Reserved', completeAssembly: 'Assembly complete', cancel: 'Cancelled' }
    const res = await window.electronAPI.builds[action](buildId)
    if (res.success) { toast.success(labels[action]); void load() }
    else toast.error(res.error ?? 'Failed')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">PC Builds</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Build custom PCs from inventory — track component reservation and assembly</p>
        </div>
        <button type="button" onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md">
          <Plus className="w-4 h-4" /> New Build
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="search" placeholder="Search builds…" value={search} onChange={e => setSearch(e.target.value)}
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Build</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Parts Cost</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sell Price</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>}
            {!loading && builds.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Cpu className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No builds found</p>
                </td>
              </tr>
            )}
            {builds.map(b => (
              <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.item_count} component{b.item_count !== 1 ? 's' : ''}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{b.customer_name ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(b.total_cost ?? 0)}</td>
                <td className="px-4 py-3 text-right font-mono">{b.sell_price ? fmt(b.sell_price) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[b.status] ?? ''}`}>
                    {STATUS_LABELS[b.status] ?? b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{b.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {b.status === 'draft' && (
                      <button type="button" title="Reserve stock"
                        onClick={() => void handleAction(b.id, 'reserve')}
                        className="p-1.5 rounded hover:bg-yellow-500/20 text-yellow-400">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(b.status === 'reserved' || b.status === 'assembling') && (
                      <button type="button" title="Mark assembly complete"
                        onClick={() => void handleAction(b.id, 'completeAssembly')}
                        className="p-1.5 rounded hover:bg-green-500/20 text-green-400">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!['sold', 'cancelled', 'complete'].includes(b.status) && (
                      <button type="button" title="Cancel build"
                        onClick={() => void handleAction(b.id, 'cancel')}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > builds.length && <p className="text-xs text-muted-foreground text-center">Showing {builds.length} of {total}</p>}

      {showNew && <NewBuildModal onClose={() => setShowNew(false)} onCreated={() => void load()} />}
    </div>
  )
}
