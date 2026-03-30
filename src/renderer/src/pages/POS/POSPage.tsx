import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Plus, Minus, Trash2, Tag, ShoppingCart,
  ChevronDown, ChevronUp, FileDown, Printer, Package, Truck
} from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { usePermission as _usePermission } from '../../hooks/usePermission'
import { pdf } from '@react-pdf/renderer'
import { useCartStore } from '../../store/cartStore'
import { useDebounce } from '../../hooks/useDebounce'
import { useBarcode } from '../../hooks/useBarcode'
import { formatCurrency } from '../../lib/utils'
import { toast } from '../../store/notificationStore'
import CustomerSelector from './CustomerSelector'
import DiscountModal from './DiscountModal'
import PaymentModal from './PaymentModal'
import DraftInvoices from './DraftInvoices'
import { usePermission } from '../../hooks/usePermission'
import { InvoicePDF, type InvoiceData } from '../../components/pdf/InvoicePDF'

interface Product {
  id: number; name: string; sku: string | null; barcode: string | null
  sell_price: number; cost_price: number; stock_quantity: number; unit: string
  category_name: string | null; brand_name: string | null
}

export default function POSPage(): JSX.Element {
  const { t } = useTranslation()
  const cart = useCartStore()
  const canDiscount = usePermission('sales.discount')

  // Product browser state
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('')
  const [brandFilter, setBrandFilter] = useState<number | ''>('')
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  // UI state
  const [showDrafts, setShowDrafts] = useState(false)
  const [draftTrigger, setDraftTrigger] = useState(0)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<{ sale_id: number; invoice_number: string } | null>(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [deliverySaving, setDeliverySaving] = useState(false)
  const canCreateTask = _usePermission('tasks.create')

  const searchRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 250)

  const downloadPDF = async (saleId: number, invoiceNumber: string) => {
    try {
      const [saleRes, settingsRes] = await Promise.all([
        window.electronAPI.sales.getById(saleId),
        window.electronAPI.settings.getAll(),
      ])
      if (!saleRes.success || !saleRes.data) { toast.error(t('common.error')); return }

      const s = saleRes.data as Record<string, unknown>
      const settings = (settingsRes.success && settingsRes.data) ? settingsRes.data as Record<string, string> : {}

      const inv: InvoiceData = {
        invoice_number:  invoiceNumber,
        sale_number:     s.sale_number as string,
        created_at:      s.created_at as string,
        customer_name:   s.customer_name as string | null,
        cashier_name:    s.cashier_name as string | null,
        items:           s.items as InvoiceData['items'],
        subtotal:        s.subtotal as number,
        discount_amount: s.discount_amount as number,
        tax_enabled:     !!(s.tax_enabled),
        tax_rate:        s.tax_rate as number,
        tax_amount:      s.tax_amount as number,
        total_amount:    s.total_amount as number,
        amount_paid:     s.amount_paid as number,
        balance_due:     s.balance_due as number,
        notes:           s.notes as string | null,
        store_name:      settings['store.name'],
        store_address:   settings['store.address'],
        store_phone:     settings['store.phone'],
        invoice_footer:  settings['invoice.footer_text'],
        currency_symbol: settings['store.currency_symbol'] ?? 'د.إ',
        currency_code:   settings['store.currency'] ?? 'AED',
        store_logo:      settings['store_logo'] || undefined,
      }

      const blob = await pdf(<InvoicePDF inv={inv} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('pos.invoiceGenerated'))
    } catch (e) {
      console.error('PDF generation failed', e)
      toast.error(t('common.error'))
    }
  }

  // Load filter options + tax settings once
  useEffect(() => {
    Promise.all([
      window.electronAPI.categories.list(),
      window.electronAPI.brands.list(),
      window.electronAPI.settings.getAll(),
    ]).then(([cats, brs, settings]) => {
      if (cats.success) setCategories(cats.data as { id: number; name: string }[])
      if (brs.success) setBrands(brs.data as { id: number; name: string }[])
      if (settings.success) {
        const s = settings.data as Record<string, string>
        cart.setTax(s['tax.enabled'] === 'true', Number(s['tax.rate'] || 0))
      }
    })
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load products whenever filters change
  useEffect(() => {
    setLoadingProducts(true)
    window.electronAPI.products.list({
      search: debouncedQuery,
      category_id: categoryFilter || undefined,
      brand_id: brandFilter || undefined,
      page: 1,
      pageSize: 120,
    }).then(res => {
      if (res.success) setProducts((res.data as { items: Product[] }).items)
      setLoadingProducts(false)
    })
  }, [debouncedQuery, categoryFilter, brandFilter])

  // Barcode scanner
  const handleBarcode = useCallback(async (code: string) => {
    const res = await window.electronAPI.products.findByBarcode(code)
    if (!res.success || !res.data) { toast.error(t('inventory.barcodeNotFound')); return }
    const p = res.data as Product
    cart.addItem({ product_id: p.id, product_name: p.name, product_sku: p.sku, unit_price: p.sell_price, cost_price: p.cost_price, discount: 0, stock_quantity: p.stock_quantity })
    setQuery('')
  }, [cart, t])
  useBarcode(handleBarcode)

  const addProduct = (p: Product) => {
    if (p.stock_quantity <= 0) { toast.error('Out of stock'); return }
    cart.addItem({ product_id: p.id, product_name: p.name, product_sku: p.sku, unit_price: p.sell_price, cost_price: p.cost_price, discount: 0, stock_quantity: p.stock_quantity })
  }

  const handleCheckout = async (payments: Array<{ method: string; amount: number; cash_received?: number; reference?: string }>) => {
    if (cart.items.length === 0) { toast.error(t('pos.cartEmpty')); return }
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    const balance_due = Math.max(0, cart.total() - totalPaid)
    const input = {
      customer_id: cart.customer?.id && cart.customer.id > 0 ? cart.customer.id : null,
      subtotal: cart.subtotal(),
      discount_type: cart.discountType,
      discount_value: cart.discountValue,
      discount_amount: cart.discountAmount(),
      tax_enabled: cart.taxEnabled,
      tax_rate: cart.taxRate,
      tax_amount: cart.taxAmount(),
      total_amount: cart.total(),
      amount_paid: Math.min(totalPaid, cart.total()),
      balance_due,
      notes: cart.notes,
      items: cart.items.map(i => ({
        product_id: i.product_id, product_name: i.product_name, product_sku: i.product_sku,
        unit_price: i.unit_price, cost_price: i.cost_price, quantity: i.quantity, discount: i.discount, line_total: i.line_total,
      })),
      payments: payments.map(p => ({
        method: p.method as 'cash' | 'card' | 'transfer' | 'mobile' | 'other',
        amount: p.amount,
        ...(p.method === 'cash' && p.cash_received != null && p.cash_received > 0 ? { cash_received: p.cash_received } : {}),
        reference: p.reference,
      })),
    }
    const res = await window.electronAPI.sales.create(input)
    if (!res.success) { toast.error(res.error ?? t('common.error')); setPaymentOpen(false); return }
    const result = res.data as { sale_id: number; invoice_number: string }
    setLastInvoice(result)
    toast.success(`${t('pos.saleComplete')} — ${result.invoice_number}`)
    cart.clear()
    setPaymentOpen(false)
    downloadPDF(result.sale_id, result.invoice_number)
  }

  const handleSaveDraft = async () => {
    if (cart.items.length === 0) { toast.error(t('pos.cartEmpty')); return }
    const input = {
      customer_id: cart.customer?.id && cart.customer.id > 0 ? cart.customer.id : null,
      subtotal: cart.subtotal(), discount_type: cart.discountType, discount_value: cart.discountValue,
      discount_amount: cart.discountAmount(), tax_enabled: cart.taxEnabled, tax_rate: cart.taxRate,
      tax_amount: cart.taxAmount(), total_amount: cart.total(), amount_paid: 0, balance_due: cart.total(),
      notes: cart.notes,
      items: cart.items.map(i => ({ product_id: i.product_id, product_name: i.product_name, product_sku: i.product_sku, unit_price: i.unit_price, cost_price: i.cost_price, quantity: i.quantity, discount: i.discount, line_total: i.line_total })),
      payments: [],
    }
    const res = await window.electronAPI.sales.saveDraft(input)
    if (res.success) { toast.success(t('pos.draftSaved')); cart.clear(); setDraftTrigger(n => n + 1); setShowDrafts(true) }
    else toast.error(res.error ?? t('common.error'))
  }

  const handleLoadDraft = async (draftId: number) => {
    const res = await window.electronAPI.sales.getDraftById(draftId)
    if (!res.success || !res.data) { toast.error(t('common.error')); return }
    const draft = res.data as {
      items: Array<{ product_id: number; product_name: string; product_sku: string | null; unit_price: number; cost_price: number; quantity: number; discount: number; line_total: number; stock_quantity?: number }>
      customer_id: number | null; discount_type: string | null; discount_value: number; tax_enabled: number; tax_rate: number; notes: string | null
    }
    cart.loadDraft({ items: draft.items.map(i => ({ ...i, stock_quantity: i.stock_quantity ?? 999 })), customer: null, discount_type: draft.discount_type, discount_value: draft.discount_value, tax_enabled: draft.tax_enabled, tax_rate: draft.tax_rate, notes: draft.notes })
    setShowDrafts(false)
    toast.success(t('pos.draftLoaded'))
  }

  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0)
  const selectCls = 'px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)]">
      {/* Left: Product browser */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Filters row */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`${t('inventory.searchProducts')} (F2)`}
              className="w-full ps-9 pe-4 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}
            className={selectCls}
          >
            <option value="">{t('inventory.category')} — {t('common.all')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')}
            className={selectCls}
          >
            <option value="">{t('inventory.brand')} — {t('common.all')}</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingProducts ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">{t('common.noData')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {products.map(p => {
                const inCart = cart.items.find(i => i.product_id === p.id)
                const outOfStock = p.stock_quantity <= 0
                return (
                  <div
                    key={p.id}
                    className={`bg-card border rounded-lg p-3 flex flex-col gap-2 transition-colors cursor-pointer hover:border-primary/60 ${outOfStock ? 'opacity-50' : ''} ${inCart ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                    onClick={() => !outOfStock && addProduct(p)}
                  >
                    {/* Top row: category + stock */}
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[70%] leading-none">
                        {p.category_name ?? '—'}
                      </span>
                      <span className={`text-xs font-medium leading-none ${
                        outOfStock ? 'text-destructive' :
                        p.stock_quantity <= 5 ? 'text-orange-500' : 'text-muted-foreground'
                      }`}>
                        {p.stock_quantity}
                      </span>
                    </div>

                    {/* Product name */}
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1">
                      {p.name}
                    </p>

                    {/* Bottom row: price + add */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">{formatCurrency(p.sell_price)}</span>
                      {inCart ? (
                        <span className="text-xs text-primary font-medium">×{inCart.quantity}</span>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom: Drafts + Last Invoice */}
        <div className="mt-2 space-y-1.5 shrink-0">
          <button onClick={() => setShowDrafts(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {showDrafts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {t('pos.savedDrafts')}
          </button>
          {showDrafts && <DraftInvoices onLoad={handleLoadDraft} trigger={draftTrigger} />}

          {lastInvoice && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-700 dark:text-green-400">
                  {t('pos.lastInvoice')}: <strong>{lastInvoice.invoice_number}</strong>
                </p>
                <button
                  onClick={() => downloadPDF(lastInvoice.sale_id, lastInvoice.invoice_number)}
                  className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 hover:underline"
                >
                  <Printer className="w-3.5 h-3.5" />{t('pos.reprint')}
                </button>
              </div>
              {canCreateTask && (
                <button
                  onClick={() => { setDeliveryDate(''); setDeliveryNotes(''); setDeliveryOpen(true) }}
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Truck className="w-3.5 h-3.5" />{t('pos.scheduleDelivery')}
                </button>
              )}
            </div>
          )}

          {/* Schedule Delivery modal */}
          <Modal
            open={deliveryOpen}
            title={t('pos.scheduleDelivery')}
            onClose={() => setDeliveryOpen(false)}
            size="sm"
            footer={
              <>
                <button onClick={() => setDeliveryOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">{t('common.cancel')}</button>
                <button
                  disabled={!deliveryDate || deliverySaving}
                  onClick={async () => {
                    if (!lastInvoice || !deliveryDate) return
                    setDeliverySaving(true)
                    const res = await window.electronAPI.tasks.createDelivery({
                      title: `Delivery — ${lastInvoice.invoice_number}`,
                      sale_id: lastInvoice.sale_id,
                      due_date: deliveryDate.split('T')[0],
                      start_datetime: deliveryDate,
                      end_datetime: deliveryDate,
                      notes: deliveryNotes || null,
                      status: 'pending',
                      priority: 'medium',
                    })
                    setDeliverySaving(false)
                    if (res.success) { toast.success(t('pos.deliveryScheduled')); setDeliveryOpen(false) }
                    else toast.error(res.error ?? t('common.error'))
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('tasks.deliveryDateTime')} *</label>
                <input type="datetime-local" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
                <textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none" />
              </div>
            </div>
          </Modal>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 xl:w-96 flex flex-col bg-card border border-border rounded-xl overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">{t('pos.cart')} ({itemCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleSaveDraft} title={t('pos.saveDraft')}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
              <FileDown className="w-3.5 h-3.5" />
            </button>
            {cart.items.length > 0 && (
              <button onClick={() => cart.clear()} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10">
                {t('common.clear')}
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-2 border-b border-border">
          <CustomerSelector value={cart.customer} onChange={cart.setCustomer} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
              <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
              {t('pos.emptyCart')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.items.map(item => (
                <div key={item.product_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)} each</p>
                    </div>
                    <button onClick={() => cart.removeItem(item.product_id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => cart.updateQty(item.product_id, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted">
                        <Minus className="w-3 h-3" />
                      </button>
                      <input type="number" min="1" max={item.stock_quantity} value={item.quantity}
                        onChange={e => cart.updateQty(item.product_id, parseInt(e.target.value) || 1)}
                        className="w-12 text-center text-sm border border-input rounded bg-background px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button onClick={() => cart.updateQty(item.product_id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-border hover:bg-muted">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-sm font-bold">{formatCurrency(item.line_total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('common.subtotal')}</span>
            <span>{formatCurrency(cart.subtotal())}</span>
          </div>
          {cart.discountAmount() > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('common.discount')}</span>
              <span className="text-destructive">-{formatCurrency(cart.discountAmount())}</span>
            </div>
          )}
          {cart.taxEnabled && cart.taxAmount() > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({cart.taxRate}%)</span>
              <span>{formatCurrency(cart.taxAmount())}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
            <span>{t('common.total')}</span>
            <span>{formatCurrency(cart.total())}</span>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {canDiscount && (
            <button onClick={() => setDiscountOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm border border-border rounded-md hover:bg-muted">
              <Tag className="w-3.5 h-3.5" />{t('pos.applyDiscount')}
              {cart.discountValue > 0 && <span className="text-xs text-primary">({cart.discountType === 'percent' ? `${cart.discountValue}%` : formatCurrency(cart.discountValue)})</span>}
            </button>
          )}
          <button
            onClick={() => {
              if (!cart.customer?.id) { toast.error(t('pos.customerRequired')); return }
              setPaymentOpen(true)
            }}
            disabled={cart.items.length === 0}
            className="w-full py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('pos.checkout')}{cart.items.length > 0 ? ` — ${formatCurrency(cart.total())}` : ''}
          </button>
        </div>
      </div>

      {discountOpen && <DiscountModal onClose={() => setDiscountOpen(false)} />}
      {paymentOpen && <PaymentModal total={cart.total()} onConfirm={handleCheckout} onClose={() => setPaymentOpen(false)} />}
    </div>
  )
}
