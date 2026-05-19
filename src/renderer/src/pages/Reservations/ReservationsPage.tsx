import { useCallback, useEffect, useState } from 'react'
import { Search, Package, AlertCircle } from 'lucide-react'
import type { ReservationRow } from '../../types/electron'
import { toast } from '../../store/notificationStore'

const STATUS_LABELS: Record<string, string> = {
  active:   'Active',
  consumed: 'Consumed',
  released: 'Released',
}
const STATUS_COLORS: Record<string, string> = {
  active:   'bg-yellow-500/20 text-yellow-400',
  consumed: 'bg-green-500/20 text-green-400',
  released: 'bg-muted text-muted-foreground',
}

export default function ReservationsPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ReservationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [productId, setProductId] = useState<string>('')

  const load = useCallback(async () => {
    if (!productId) { setRows([]); return }
    setLoading(true)
    try {
      const res = await window.electronAPI.reservations.listByProduct(Number(productId))
      if (res.success && res.data) setRows(res.data)
      else setRows([])
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { void load() }, [load])

  const handleRelease = async (id: number): Promise<void> => {
    const res = await window.electronAPI.reservations.release(id)
    if (res.success) {
      toast.success('Reservation released')
      void load()
    } else {
      toast.error(res.error ?? 'Failed to release')
    }
  }

  const filtered = rows.filter(r =>
    !search ||
    (r.product_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.job_number ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Stock Reservations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Parts reserved for repair jobs — cannot be sold until released</p>
        </div>
        <AlertCircle className="w-5 h-5 text-yellow-400" />
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by product or job…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background"
          />
        </div>
        <input
          type="number"
          placeholder="Filter by product ID…"
          value={productId}
          onChange={e => setProductId(e.target.value)}
          className="w-44 px-3 py-2 text-sm border border-input rounded-md bg-background"
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reserved By</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {productId ? 'No reservations for this product' : 'Enter a product ID to view its reservations'}
                  </p>
                </td>
              </tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.product_name ?? `Product #${r.product_id}`}</p>
                  {r.product_sku && <p className="text-xs text-muted-foreground">{r.product_sku}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.job_number ?? `Job #${r.job_card_id}`}</td>
                <td className="px-4 py-3 text-right font-mono">{r.quantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.reserver_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  {r.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void handleRelease(r.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
