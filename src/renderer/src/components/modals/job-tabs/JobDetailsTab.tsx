import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Package, Plus, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '../../../lib/utils'
import CurrencyText from '../../shared/CurrencyText'
import { useDebounce } from '../../../hooks/useDebounce'

/** Per-line shop department (mechanical vs programming). */
export type LineDepartment = 'mechanical' | 'programming'

export interface JobLineItem {
  key: string
  dbId?: number
  description: string
  /** Which team owns this line item. */
  lineDepartment: LineDepartment
  quantity: number
  cost: number
  sell: number
  /** Unified catalog row id when line came from catalog. */
  catalogId?: number
  /** Inventory product when line came from stock. */
  productId?: number
  /** Catalog default sell price snapshot (for override indicator). */
  defaultSellSnapshot?: number
}

/** Product row for the job “add from inventory” picker (subset of POS/inventory list). */
export interface JobInventoryProductRow {
  id: number
  name: string
  sku: string | null
  stock_quantity: number
  unit: string
  cost_price: number
  sell_price: number
}

/** Service catalog row for add-to-job (from search API). */
export type CatalogSvcRow = {
  id: number
  service_name: string
  price: number
  department: string
}

const CATALOG_PAGE_SIZE = 80

function catalogDeptShortLabel(department: string): string {
  const d = department.toLowerCase()
  if (d === 'programming') return 'Prog'
  if (d === 'mechanical') return 'Mech'
  if (!d) return '—'
  return d.length > 10 ? `${d.slice(0, 8)}…` : d
}

interface Technician {
  id: number
  full_name: string
  /** User's shop department; both = can take any job type */
  work_department?: string | null
}
interface JobTypeOption { id: number; name: string }

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
const STATUSES = [
  'pending',
  'in_progress',
  'waiting_parts',
  'waiting_for_programming',
  'ready',
  'completed_delivered',
  'delivered',
  'cancelled',
] as const
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  waiting_parts: 'Waiting for Parts',
  waiting_for_programming: 'Waiting for Programming',
  ready: 'Ready',
  completed_delivered: 'Completed / Delivered',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const LINE_DEPT_OPTIONS: { value: LineDepartment; label: string }[] = [
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'programming', label: 'Programming' },
]
const BAYS = ['', 'Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6']

export type JobFormState = {
  job_type: string
  priority: (typeof PRIORITIES)[number]
  status: (typeof STATUSES)[number]
  technician_id: string
  bay_number: string
  mileage_in: string
  expected_completion: string
  complaint: string
  diagnosis: string
  work_done: string
  labor_hours: string
  labor_rate: string
  deposit: string
  tax_rate: string
  notes: string
  customer_authorized: boolean
  /** Preferred payment when settling / drafting invoice */
  payment_method: string
  invoice_discount_type: '' | 'percentage' | 'fixed'
  invoice_discount_value: string
  invoice_payment_terms: string
}

/** True when a line counts toward job totals / board department (inventory lines may have shorter labels). */
export function isValidJobLineItem(l: JobLineItem): boolean {
  const d = l.description.trim()
  const descOk = d.length >= 3 || (l.productId != null && d.length >= 1)
  return descOk && l.quantity >= 1 && l.cost > 0 && l.sell > 0
}

/** Derive job board department from line items (replaces manual job-level department). */
export function deriveJobBoardDepartment(lineItems: JobLineItem[]): 'mechanical' | 'programming' | 'both' {
  const valid = lineItems.filter(isValidJobLineItem)
  if (valid.length === 0) return 'both'
  const hasM = valid.some(l => l.lineDepartment === 'mechanical')
  const hasP = valid.some(l => l.lineDepartment === 'programming')
  if (hasM && hasP) return 'both'
  if (hasP && !hasM) return 'programming'
  return 'mechanical'
}

function marginPct(cost: number, sell: number): number {
  if (sell <= 0) return 0
  return ((sell - cost) / sell) * 100
}

function JobDetailsTabInner(props: {
  form: JobFormState
  setField: (key: keyof JobFormState, val: string | boolean) => void
  lineItems: JobLineItem[]
  technicians: Technician[]
  jobTypes: JobTypeOption[]
  selectedVehicle: { make: string; model: string } | null
  addLine: () => void
  removeLine: (key: string) => void
  updateLine: (
    key: string,
    patch: Partial<
      Pick<JobLineItem, 'description' | 'lineDepartment' | 'quantity' | 'cost' | 'sell' | 'defaultSellSnapshot' | 'productId'>
    >,
  ) => void
  isCatalogChecked: (id: number) => boolean
  toggleCatalog: (row: CatalogSvcRow, on: boolean) => void
  inventoryProducts: JobInventoryProductRow[]
  inventoryLoading: boolean
  onAddProductFromInventory: (product: JobInventoryProductRow) => void
}): JSX.Element {
  const {
    form,
    setField,
    lineItems,
    addLine,
    removeLine,
    updateLine,
    technicians,
    jobTypes,
    selectedVehicle,
    isCatalogChecked,
    toggleCatalog,
    inventoryProducts,
    inventoryLoading,
    onAddProductFromInventory,
  } = props

  const [invSearch, setInvSearch] = useState('')

  const [catSearch, setCatSearch] = useState('')
  const [catDeptFilter, setCatDeptFilter] = useState<'all' | 'mechanical' | 'programming'>('all')
  const [catalogResults, setCatalogResults] = useState<CatalogSvcRow[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const debouncedCatSearch = useDebounce(catSearch, 320)
  const catalogListGen = useRef(0)
  const catalogLoadMoreLock = useRef(false)

  useEffect(() => {
    setCatSearch('')
    setCatDeptFilter('all')
    setCatalogResults([])
    setCatalogTotal(0)
  }, [selectedVehicle?.id])

  useEffect(() => {
    if (!selectedVehicle) {
      setCatalogResults([])
      setCatalogTotal(0)
      return
    }
    const gen = ++catalogListGen.current
    catalogLoadMoreLock.current = false
    setCatalogLoading(true)
    const dep = catDeptFilter === 'all' ? undefined : catDeptFilter
    void window.electronAPI.serviceCatalog
      .list({
        search: debouncedCatSearch.trim(),
        department: dep,
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
        active_only: true,
        sort_by: 'name',
        sort_dir: 'asc',
      })
      .then(res => {
        if (catalogListGen.current !== gen) return
        setCatalogLoading(false)
        if (!res.success || !res.data) {
          setCatalogResults([])
          setCatalogTotal(0)
          return
        }
        const payload = res.data as { items: Array<Record<string, unknown>>; total: number }
        const items = payload.items ?? []
        const mapped: CatalogSvcRow[] = items.map(r => ({
          id: r.id as number,
          service_name: String(r.service_name ?? ''),
          price: Number(r.default_price ?? r.price ?? 0) || 0,
          department: String(r.department ?? 'mechanical').toLowerCase(),
        }))
        setCatalogResults(mapped)
        setCatalogTotal(Number(payload.total) || 0)
      })
      .catch(() => {
        if (catalogListGen.current === gen) {
          setCatalogLoading(false)
          setCatalogResults([])
          setCatalogTotal(0)
        }
      })
  }, [selectedVehicle, debouncedCatSearch, catDeptFilter])

  const loadMoreCatalog = useCallback(() => {
    if (!selectedVehicle || catalogLoading) return
    if (catalogResults.length >= catalogTotal) return
    if (catalogLoadMoreLock.current) return
    const nextPage = Math.floor(catalogResults.length / CATALOG_PAGE_SIZE) + 1
    const gen = catalogListGen.current
    catalogLoadMoreLock.current = true
    setCatalogLoading(true)
    const dep = catDeptFilter === 'all' ? undefined : catDeptFilter
    void window.electronAPI.serviceCatalog
      .list({
        search: debouncedCatSearch.trim(),
        department: dep,
        page: nextPage,
        pageSize: CATALOG_PAGE_SIZE,
        active_only: true,
        sort_by: 'name',
        sort_dir: 'asc',
      })
      .then(res => {
        catalogLoadMoreLock.current = false
        if (catalogListGen.current !== gen) return
        setCatalogLoading(false)
        if (!res.success || !res.data) return
        const payload = res.data as { items: Array<Record<string, unknown>> }
        const items = payload.items ?? []
        const mapped: CatalogSvcRow[] = items.map(r => ({
          id: r.id as number,
          service_name: String(r.service_name ?? ''),
          price: Number(r.default_price ?? r.price ?? 0) || 0,
          department: String(r.department ?? 'mechanical').toLowerCase(),
        }))
        setCatalogResults(prev => [...prev, ...mapped])
      })
      .catch(() => {
        catalogLoadMoreLock.current = false
        if (catalogListGen.current === gen) setCatalogLoading(false)
      })
  }, [
    selectedVehicle,
    catalogLoading,
    catalogResults.length,
    catalogTotal,
    debouncedCatSearch,
    catDeptFilter,
  ])

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase()
    if (!q) return inventoryProducts
    return inventoryProducts.filter(p => {
      const name = p.name.toLowerCase()
      const sku = (p.sku ?? '').toLowerCase()
      return name.includes(q) || sku.includes(q)
    })
  }, [inventoryProducts, invSearch])

  const derivedJobDepartment = useMemo(() => deriveJobBoardDepartment(lineItems), [lineItems])

  const techniciansForJob = useMemo(() => {
    const jd = derivedJobDepartment
    return technicians.filter(u => {
      const wd = u.work_department?.toLowerCase() ?? ''
      if (jd === 'both') {
        if (!wd || wd === 'both') return true
        return wd === 'mechanical' || wd === 'programming'
      }
      if (!wd || wd === 'both') return true
      return wd === jd
    })
  }, [technicians, derivedJobDepartment])

  useEffect(() => {
    if (!form.technician_id) return
    const ok = techniciansForJob.some(u => String(u.id) === form.technician_id)
    if (!ok) setField('technician_id', '')
  }, [form.technician_id, techniciansForJob, setField])

  const partsCost = useMemo(
    () => lineItems.reduce((s, p) => s + p.quantity * p.cost, 0),
    [lineItems],
  )
  const partsSell = useMemo(
    () => lineItems.reduce((s, p) => s + p.quantity * p.sell, 0),
    [lineItems],
  )
  const marginTotal = partsSell - partsCost
  const marginPctTotal = partsSell > 0 ? (marginTotal / partsSell) * 100 : 0

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  return (
    <div className="space-y-5 max-h-[min(70vh,720px)] overflow-y-auto pe-1">
      {selectedVehicle && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Catalog services ({selectedVehicle.make} / {selectedVehicle.model})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Large catalogs stay fast: search filters on the server in pages of {CATALOG_PAGE_SIZE}. Leave search empty to browse alphabetically; use department to narrow Mechanical vs Programming.
              {catalogTotal > 0 && (
                <span className="block mt-1 text-foreground/90">
                  {catalogTotal.toLocaleString()} match{catalogTotal === 1 ? '' : 'es'} with current filters
                  {catalogResults.length < catalogTotal
                    ? ` · ${catalogResults.length.toLocaleString()} shown below`
                    : ''}
                  .
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sm:w-44 shrink-0">
              <span className="sr-only">Department</span>
              <select
                value={catDeptFilter}
                onChange={e =>
                  setCatDeptFilter(e.target.value as 'all' | 'mechanical' | 'programming')
                }
                className={inputCls}
              >
                <option value="all">All departments</option>
                <option value="mechanical">Mechanical only</option>
                <option value="programming">Programming only</option>
              </select>
            </label>
            <input
              type="search"
              value={catSearch}
              onChange={e => setCatSearch(e.target.value)}
              placeholder="Search service name or description…"
              className={`${inputCls} flex-1 min-w-0`}
              autoComplete="off"
              aria-label="Search service catalog"
            />
          </div>
          {catalogLoading && catalogResults.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading catalog…</p>
          ) : catalogResults.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
              No catalog rows match. Try another keyword or switch department filter.
            </p>
          ) : (
            <ul className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
              {catalogResults.map(row => {
                const onJob = isCatalogChecked(row.id)
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground block truncate">{row.service_name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        <span
                          className="inline-block rounded px-1 py-0 mr-1.5 bg-muted text-[10px] font-medium uppercase"
                          title={row.department}
                        >
                          {catalogDeptShortLabel(row.department)}
                        </span>
                        <CurrencyText amount={row.price} className="inline" />
                      </span>
                    </div>
                    {onJob ? (
                      <button
                        type="button"
                        onClick={() => toggleCatalog(row, false)}
                        className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-md border border-border text-destructive hover:bg-destructive/10"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCatalog(row, true)}
                        className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
                      >
                        Add
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {catalogResults.length > 0 && catalogResults.length < catalogTotal && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
              <p className="text-[11px] text-muted-foreground">
                Showing {catalogResults.length.toLocaleString()} of {catalogTotal.toLocaleString()}
              </p>
              <button
                type="button"
                disabled={catalogLoading}
                onClick={() => loadMoreCatalog()}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
              >
                {catalogLoading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Job line items</h3>
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Add row
          </button>
        </div>
        {lineItems.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-6 text-center text-sm text-muted-foreground">
            No lines yet — add parts or services with cost and sell price (AED).
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto">
            <div className="min-w-[780px] grid grid-cols-[minmax(140px,1fr)_128px_52px_72px_72px_56px_40px] gap-1 bg-muted/50 px-2 py-2 text-xs font-medium text-muted-foreground">
              <span>Description</span>
              <span>Dept</span>
              <span className="text-center">Qty</span>
              <span className="text-end">Cost</span>
              <span className="text-end">Sell</span>
              <span className="text-end">Margin %</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {lineItems.map((row, idx) => (
                <div
                  key={row.key}
                  className={cn(
                    'min-w-[780px] grid grid-cols-[minmax(140px,1fr)_128px_52px_72px_72px_56px_40px] gap-1 items-center px-2 py-1.5 text-sm',
                    idx % 2 === 1 && 'bg-muted/15',
                  )}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    {row.productId != null && (
                      <span
                        className="shrink-0 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-900 dark:text-amber-100"
                        title="Line linked to inventory product"
                      >
                        <Package className="w-3 h-3 opacity-80" aria-hidden />
                        Inv
                      </span>
                    )}
                    <input
                      value={row.description}
                      onChange={e => updateLine(row.key, { description: e.target.value })}
                      placeholder="Description (min 3 chars)"
                      className="flex-1 min-w-0 px-2 py-1 text-sm border border-input rounded bg-background"
                      aria-label="Line description"
                    />
                  </div>
                  <select
                    value={row.lineDepartment}
                    onChange={e =>
                      updateLine(row.key, { lineDepartment: e.target.value as LineDepartment })
                    }
                    className="w-full px-1 py-1 text-xs border border-input rounded bg-background"
                    aria-label="Line department"
                  >
                    {LINE_DEPT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={e => updateLine(row.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full px-1 py-1 text-sm border border-input rounded text-center tabular-nums"
                    aria-label="Quantity"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.cost}
                    onChange={e => updateLine(row.key, { cost: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full px-1 py-1 text-sm border border-input rounded text-end tabular-nums"
                    aria-label="Cost price AED"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.sell}
                    onChange={e => updateLine(row.key, { sell: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full px-1 py-1 text-sm border border-input rounded text-end tabular-nums"
                    aria-label="Sell price AED"
                  />
                  <span className="text-end text-xs tabular-nums text-muted-foreground">
                    {marginPct(row.cost, row.sell).toFixed(1)}%
                    {row.defaultSellSnapshot != null &&
                      Math.abs(row.sell - row.defaultSellSnapshot) > 1e-6 && (
                      <span
                        className="block text-[10px] text-primary"
                        title={
                          row.productId != null
                            ? 'Sell price changed from inventory default'
                            : 'Price overridden from catalog default'
                        }
                      >
                        *override
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(row.key)}
                    className="flex items-center justify-center w-8 h-8 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-2 py-3 bg-muted/30 border-t border-border text-sm">
              <div className="flex justify-between sm:flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">Total cost</span>
                <span className="font-semibold tabular-nums">{formatCurrency(partsCost)} AED</span>
              </div>
              <div className="flex justify-between sm:flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">Total sell</span>
                <span className="font-semibold tabular-nums">{formatCurrency(partsSell)} AED</span>
              </div>
              <div className="flex justify-between sm:flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">Margin</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(marginTotal)} AED ({marginPctTotal.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Inventory</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search stock and add products — they appear in <strong className="text-foreground font-medium">Job line items</strong> above with cost and sell filled from the product.
            </p>
          </div>
        </div>
        <input
          type="search"
          value={invSearch}
          onChange={e => setInvSearch(e.target.value)}
          placeholder="Search by name or SKU…"
          className={`${inputCls}`}
          autoComplete="off"
          aria-label="Filter inventory products"
        />
        {inventoryLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading inventory…</p>
        ) : filteredInventory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
            {inventoryProducts.length === 0
              ? 'No active products in inventory.'
              : 'No matches — try another search.'}
          </p>
        ) : (
          <ul className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
            {filteredInventory.map(p => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground truncate block">{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {p.sku ? `${p.sku} · ` : ''}
                    {p.stock_quantity} {p.unit} in stock · sell{' '}
                    <CurrencyText amount={p.sell_price} className="inline" />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onAddProductFromInventory(p)
                    setInvSearch('')
                  }}
                  className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Expected completion</label>
          <input type="date" value={form.expected_completion} onChange={e => setField('expected_completion', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label
            className={labelCls}
            title="Technicians are filtered to match the departments used on your line items (Mechanical / Programming)."
          >
            Technician
          </label>
          <select value={form.technician_id} onChange={e => setField('technician_id', e.target.value)} className={inputCls}>
            <option value="">— Unassigned —</option>
            {techniciansForJob.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name}
                {u.work_department && u.work_department !== 'both' ? ` (${u.work_department})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Bay</label>
          <select value={form.bay_number} onChange={e => setField('bay_number', e.target.value)} className={inputCls}>
            {BAYS.map(b => <option key={b || 'none'} value={b}>{b || 'Unassigned'}</option>)}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={form.customer_authorized}
          onChange={e => setField('customer_authorized', e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        Customer authorized work exceeding estimate
      </label>
    </div>
  )
}

const JobDetailsTab = memo(JobDetailsTabInner)
export default JobDetailsTab
