import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, Cpu, X, Check, Ban, TrendingUp, TrendingDown, Package } from 'lucide-react'
import type { BuildRow, BuildCreateInput } from '../../types/electron'
import { toast } from '../../store/notificationStore'
import { useDebounce } from '../../hooks/useDebounce'
import CurrencyText from '../../components/shared/CurrencyText'
import { DIRHAM_PATH } from '../../lib/dirhamSvg'

// ── Inline Dirham icon for use in labels ─────────────────────────────────────
function DirhamIcon({ className = '' }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 85.41 74.28"
      aria-hidden="true"
      className={className}
      style={{ height: '0.85em', width: 'auto', display: 'inline-block', verticalAlign: '-0.05em' }}
    >
      <path fill="currentColor" d={DIRHAM_PATH} />
    </svg>
  )
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

// ── Product search row ────────────────────────────────────────────────────────

interface ProductHit {
  id: number
  name: string
  sku: string | null
  cost_price: number
  sell_price: number
  stock_quantity: number
}

interface LineItem {
  product_id: number | null
  product_name: string
  sku: string | null
  unit_cost: number
  stock_available: number
  quantity: number
}

function ProductSearchRow({
  item,
  onChange,
  onRemove,
}: {
  item: LineItem
  onChange: (patch: Partial<LineItem>) => void
  onRemove: () => void
}): JSX.Element {
  const [query, setQuery] = useState(item.product_name)
  const dQuery = useDebounce(query, 250)
  const [hits, setHits] = useState<ProductHit[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!dQuery.trim() || item.product_id !== null) { setHits([]); return }
    void window.electronAPI.products.search(dQuery).then(res => {
      if (res.success && res.data) setHits(res.data as ProductHit[])
      else setHits([])
    })
  }, [dQuery, item.product_id])

  const select = (p: ProductHit): void => {
    setQuery(p.name)
    setOpen(false)
    setHits([])
    onChange({
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      unit_cost: p.cost_price,
      stock_available: p.stock_quantity,
    })
  }

  const clear = (): void => {
    setQuery('')
    onChange({ product_id: null, product_name: '', sku: null, unit_cost: 0, stock_available: 0 })
  }

  const lineTotal = item.quantity * item.unit_cost
  const overStock = item.product_id !== null && item.quantity > item.stock_available

  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      {/* Product picker */}
      <div className="col-span-5 relative" ref={wrapRef}>
        {item.product_id === null ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => { if (hits.length) setOpen(true) }}
                placeholder="Search product…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background"
              />
            </div>
            {open && hits.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-xl max-h-52 overflow-y-auto">
                {hits.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => select(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <CurrencyText amount={p.cost_price} className="text-xs text-muted-foreground" />
                      <p className={`text-xs mt-0.5 ${p.stock_quantity === 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {p.stock_quantity} in stock
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {open && query.length > 1 && hits.length === 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md px-3 py-2 text-xs text-muted-foreground shadow-xl">
                No products found
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md bg-muted/30">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{item.product_name}</p>
              {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
            </div>
            <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Unit cost */}
      <div className="col-span-2">
        <input
          type="number"
          value={item.unit_cost}
          min="0"
          step="0.01"
          onChange={e => onChange({ unit_cost: Number(e.target.value) })}
          onFocus={e => e.target.select()}
          className="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-right font-mono"
        />
      </div>

      {/* Quantity */}
      <div className="col-span-2">
        <input
          type="number"
          value={item.quantity}
          min="1"
          max={item.stock_available > 0 ? item.stock_available : undefined}
          onChange={e => onChange({ quantity: Math.max(1, Number(e.target.value)) })}
          onFocus={e => e.target.select()}
          className={`w-full px-2 py-1.5 text-sm border rounded-md bg-background text-right font-mono ${
            overStock ? 'border-red-500 text-red-400' : 'border-input'
          }`}
        />
        {item.product_id !== null && (
          <p className={`text-[10px] mt-0.5 text-right ${overStock ? 'text-red-400' : 'text-muted-foreground'}`}>
            {item.stock_available} avail
          </p>
        )}
      </div>

      {/* Line total */}
      <div className="col-span-2 py-1.5 flex justify-end">
        <CurrencyText amount={lineTotal} className="text-sm text-muted-foreground" />
      </div>

      {/* Remove */}
      <div className="col-span-1 flex justify-center pt-1.5">
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── New build modal ───────────────────────────────────────────────────────────

function NewBuildModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [sellPrice, setSellPrice] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [items, setItems] = useState<LineItem[]>([
    { product_id: null, product_name: '', sku: null, unit_cost: 0, stock_available: 0, quantity: 1 },
  ])

  const addRow = (): void => setItems(p => [
    ...p,
    { product_id: null, product_name: '', sku: null, unit_cost: 0, stock_available: 0, quantity: 1 },
  ])

  const removeRow = (i: number): void => setItems(p => p.filter((_, idx) => idx !== i))

  const patchRow = (i: number, patch: Partial<LineItem>): void =>
    setItems(p => p.map((x, idx) => idx === i ? { ...x, ...patch } : x))

  // Live calculations
  const totalCost = items.reduce((s, it) => s + it.quantity * it.unit_cost, 0)
  const sellNum = parseFloat(sellPrice) || 0
  const profit = sellNum - totalCost
  const margin = sellNum > 0 ? (profit / sellNum) * 100 : 0
  const profitPositive = profit >= 0
  const hasOverStock = items.some(it => it.product_id !== null && it.quantity > it.stock_available)

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) { toast.error('Build name is required'); return }
    const valid = items.filter(it => it.product_id !== null && it.quantity > 0)
    if (!valid.length) { toast.error('Add at least one component from inventory'); return }
    if (hasOverStock) { toast.error('One or more items exceed available stock'); return }

    setSaving(true)
    try {
      const payload: BuildCreateInput = {
        name: name.trim(),
        sell_price: sellNum,
        notes: notes.trim() || null,
        items: valid.map(it => ({
          product_id: it.product_id!,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">New PC Build</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Build name + sell price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Build Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Gaming Build #1"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Sell Price <DirhamIcon />
              </label>
              <input
                type="number"
                value={sellPrice}
                onChange={e => setSellPrice(e.target.value)}
                onFocus={e => e.target.select()}
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background font-mono"
              />
            </div>
          </div>

          {/* Components table */}
          <div>
            <div className="grid grid-cols-12 gap-2 mb-1.5 px-0.5">
              <span className="col-span-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Unit Cost <DirhamIcon />
              </span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Qty</span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total</span>
              <span className="col-span-1" />
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <ProductSearchRow
                  key={i}
                  item={item}
                  onChange={patch => patchRow(i, patch)}
                  onRemove={() => removeRow(i)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add component
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background resize-none"
            />
          </div>
        </div>

        {/* Live profit summary */}
        <div className="border-t border-border bg-muted/30 px-5 py-3">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Parts Cost</p>
              <CurrencyText amount={totalCost} className="font-semibold text-sm" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Sell Price</p>
              {sellNum > 0
                ? <CurrencyText amount={sellNum} className="font-semibold text-sm" />
                : <span className="text-sm text-muted-foreground">—</span>
              }
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Profit</p>
              {sellNum > 0 ? (
                <span className={`inline-flex items-center gap-1 font-semibold text-sm ${
                  profitPositive ? 'text-green-400' : 'text-red-400'
                }`}>
                  {profitPositive
                    ? <TrendingUp className="w-3.5 h-3.5" />
                    : <TrendingDown className="w-3.5 h-3.5" />
                  }
                  <CurrencyText amount={profit} className="text-inherit" />
                </span>
              ) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Margin</p>
              <span className={`font-semibold text-sm ${
                sellNum === 0
                  ? 'text-muted-foreground'
                  : profitPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {sellNum > 0 ? `${margin.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          {hasOverStock
            ? <p className="text-xs text-red-400">⚠ Some items exceed available stock</p>
            : <span />
          }
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Build'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BuildsPage(): JSX.Element {
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
          <p className="text-xs text-muted-foreground mt-0.5">
            Build custom PCs from inventory — search components, track costs and profit
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md"
        >
          <Plus className="w-4 h-4" /> New Build
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search builds…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background"
        >
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
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Parts Cost <DirhamIcon />
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Sell Price <DirhamIcon />
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Profit <DirhamIcon />
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>
            )}
            {!loading && builds.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <Cpu className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No builds found — create your first build</p>
                </td>
              </tr>
            )}
            {builds.map(b => {
              const cost = b.total_cost ?? 0
              const sell = b.sell_price ?? 0
              const bProfit = sell > 0 ? sell - cost : null
              return (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Package className="inline w-3 h-3 mr-0.5 -mt-0.5" />
                      {b.item_count} component{b.item_count !== 1 ? 's' : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <CurrencyText amount={cost} className="text-sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sell > 0
                      ? <CurrencyText amount={sell} className="text-sm" />
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {bProfit !== null
                      ? <CurrencyText
                          amount={bProfit}
                          className={`text-sm ${bProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}
                        />
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[b.status] ?? ''}`}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{b.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {b.status === 'draft' && (
                        <button
                          type="button"
                          title="Reserve stock for this build"
                          onClick={() => void handleAction(b.id, 'reserve')}
                          className="px-2 py-1 rounded hover:bg-yellow-500/20 text-yellow-400 text-xs font-medium"
                        >
                          Reserve
                        </button>
                      )}
                      {(b.status === 'reserved' || b.status === 'assembling') && (
                        <button
                          type="button"
                          title="Mark assembly complete — deducts stock"
                          onClick={() => void handleAction(b.id, 'completeAssembly')}
                          className="p-1.5 rounded hover:bg-green-500/20 text-green-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!['sold', 'cancelled', 'complete'].includes(b.status) && (
                        <button
                          type="button"
                          title="Cancel build"
                          onClick={() => void handleAction(b.id, 'cancel')}
                          className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > builds.length && (
        <p className="text-xs text-muted-foreground text-center">Showing {builds.length} of {total}</p>
      )}

      {showNew && (
        <NewBuildModal
          onClose={() => setShowNew(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  )
}
