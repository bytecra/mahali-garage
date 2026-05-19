import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, RefreshCw, X } from 'lucide-react'
import type { BuybackRow, BuybackCreateInput } from '../../types/electron'
import { toast } from '../../store/notificationStore'
import CurrencyText from '../../components/shared/CurrencyText'

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

interface CustomerHit { id: number; name: string; phone?: string | null }

function SellModal({ row, onClose, onDone }: { row: BuybackRow; onClose: () => void; onDone: () => void }): JSX.Element {
  const [resalePrice, setResalePrice] = useState<number>(row.resale_price ?? row.buyback_price)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerHits([]); return }
    const t = setTimeout(async () => {
      const res = await window.electronAPI.customers.search(customerQuery)
      if (res.success && res.data) setCustomerHits(res.data as CustomerHit[])
    }, 250)
    return () => clearTimeout(t)
  }, [customerQuery])

  const pickCustomer = (c: CustomerHit): void => {
    setSelectedCustomer(c)
    setCustomerQuery(c.name)
    setCustomerHits([])
  }

  const handleSell = async (): Promise<void> => {
    if (resalePrice <= 0) { toast.error('Resale price must be greater than 0'); return }
    setSaving(true)
    try {
      const res = await window.electronAPI.buybacks.update(row.id, {
        status: 'sold',
        resale_price: resalePrice,
        ...(selectedCustomer ? { customer_id: selectedCustomer.id } : {}),
      })
      if (res.success) { toast.success('Buyback marked as sold'); onDone(); onClose() }
      else toast.error(res.error ?? 'Failed')
    } finally { setSaving(false) }
  }

  const handleScrap = async (): Promise<void> => {
    setSaving(true)
    try {
      const res = await window.electronAPI.buybacks.update(row.id, { status: 'scrapped' })
      if (res.success) { toast.success('Buyback scrapped'); onDone(); onClose() }
      else toast.error(res.error ?? 'Failed')
    } finally { setSaving(false) }
  }

  const profit = resalePrice - row.buyback_price

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Sell Device</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-muted/40 rounded-md p-3 space-y-1">
            <p className="font-medium text-sm">{row.device_type}</p>
            {(row.brand || row.model) && (
              <p className="text-xs text-muted-foreground">{[row.brand, row.model].filter(Boolean).join(' ')}</p>
            )}
            {row.serial_number && <p className="text-xs text-muted-foreground font-mono">{row.serial_number}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Paid to customer</p>
              <CurrencyText amount={row.buyback_price} className="font-mono font-medium" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Profit</p>
              <span className={`font-mono font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium mb-1">Customer <span className="text-muted-foreground">(optional)</span></label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Name or phone number…"
                value={customerQuery}
                onChange={e => { setCustomerQuery(e.target.value); if (!e.target.value) setSelectedCustomer(null) }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background"
              />
              {selectedCustomer && (
                <button type="button" onClick={() => { setSelectedCustomer(null); setCustomerQuery('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {customerHits.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                {customerHits.map(c => (
                  <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between items-center">
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Resale Price *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={resalePrice}
              onChange={e => setResalePrice(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 p-4 border-t border-border">
          <button type="button" disabled={saving} onClick={() => void handleScrap()}
            className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted text-muted-foreground disabled:opacity-50">
            Scrap
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void handleSell()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Mark as Sold'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewBuybackModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
  const [form, setForm] = useState<BuybackCreateInput>({
    device_type: '', brand: '', model: '', serial_number: '',
    condition_grade: 'C', buyback_price: 0, notes: '',
    storage: '', ram: '', color: '', imei: '', battery_health: undefined, accessories: '',
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
        storage: form.storage || null,
        ram: form.ram || null,
        color: form.color || null,
        imei: form.imei || null,
        accessories: form.accessories || null,
      })
      if (res.success) { toast.success('Buyback recorded'); onCreated(); onClose() }
      else toast.error(res.error ?? 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-6">
      <div className="bg-card border border-border rounded-lg w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Record Buyback</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">

          {/* Identity */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Device Identity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Device Type *</label>
                <input value={form.device_type} onChange={e => set('device_type', e.target.value)}
                  placeholder="e.g. iPhone 14, PS5, Gaming PC…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Brand</label>
                <input value={form.brand ?? ''} onChange={e => set('brand', e.target.value)}
                  placeholder="Apple, Sony, Samsung…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Model</label>
                <input value={form.model ?? ''} onChange={e => set('model', e.target.value)}
                  placeholder="Pro Max, Slim, RTX 4090…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Serial Number</label>
                <input value={form.serial_number ?? ''} onChange={e => set('serial_number', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">IMEI <span className="text-muted-foreground">(phones/tablets)</span></label>
                <input value={form.imei ?? ''} onChange={e => set('imei', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Color</label>
                <input value={form.color ?? ''} onChange={e => set('color', e.target.value)}
                  placeholder="Space Grey, Black…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
            </div>
          </div>

          {/* Specs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Specs</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Storage</label>
                <input value={form.storage ?? ''} onChange={e => set('storage', e.target.value)}
                  placeholder="256GB, 1TB…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">RAM</label>
                <input value={form.ram ?? ''} onChange={e => set('ram', e.target.value)}
                  placeholder="8GB, 16GB…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Battery Health <span className="text-muted-foreground">%</span></label>
                <input type="number" min="0" max="100"
                  value={form.battery_health ?? ''}
                  onChange={e => set('battery_health', e.target.value ? Number(e.target.value) : null)}
                  placeholder="85"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Accessories Included</label>
                <input value={form.accessories ?? ''} onChange={e => set('accessories', e.target.value)}
                  placeholder="Charger, box, case…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
            </div>
          </div>

          {/* Condition & Price */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Condition & Price</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Condition</label>
                <select value={form.condition_grade} onChange={e => set('condition_grade', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background">
                  <option value="A">A — Excellent</option>
                  <option value="B">B — Good</option>
                  <option value="C">C — Fair</option>
                  <option value="D">D — Poor</option>
                  <option value="broken">Broken / Parts only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Buyback Price</label>
                <input type="number" value={form.buyback_price ?? 0} min="0"
                  onChange={e => set('buyback_price', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background" />
              </div>
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
  const [rows, setRows] = useState<BuybackRow[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [sellRow, setSellRow] = useState<BuybackRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.buybacks.list({
        search: search || undefined,
        status: (statusFilter || undefined) as BuybackRow['status'] | undefined,
        pageSize: 50,
      })
      if (res.success && res.data) {
        const d = res.data as { items: BuybackRow[]; total: number }
        setRows(d.items)
        setTotal(d.total)
      }
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
                <td className="px-4 py-3 text-right"><CurrencyText amount={r.buyback_price} className="font-mono text-sm" /></td>
                <td className="px-4 py-3 text-right">
                  {r.resale_price != null ? <CurrencyText amount={r.resale_price} className="font-mono text-sm" /> : <span className="text-muted-foreground">—</span>}
                </td>
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
                  {r.status === 'ready' && (
                    <button type="button" onClick={() => setSellRow(r)}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                      Sell →
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
      {sellRow && <SellModal row={sellRow} onClose={() => setSellRow(null)} onDone={() => void load()} />}
    </div>
  )
}
