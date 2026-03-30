import { create } from 'zustand'

export interface CartItem {
  product_id: number
  product_name: string
  product_sku: string | null
  unit_price: number
  cost_price: number
  quantity: number
  discount: number        // per-item discount (fixed amount)
  line_total: number
  stock_quantity: number  // for validation
}

export interface CartCustomer {
  id: number
  name: string
  phone: string | null
  balance: number
}

export interface CartPayment {
  method: 'cash' | 'card' | 'transfer' | 'mobile' | 'other'
  /** Portion of invoice total allocated to this tender */
  amount: number
  /** Cash only: bills/coins received (defaults to amount when omitted). */
  cash_received?: number
  reference?: string
}

interface CartState {
  items: CartItem[]
  customer: CartCustomer | null
  discountType: 'percent' | 'fixed' | null
  discountValue: number
  taxEnabled: boolean
  taxRate: number
  notes: string

  // computed (derived)
  subtotal: () => number
  discountAmount: () => number
  taxAmount: () => number
  total: () => number

  // actions
  addItem: (item: Omit<CartItem, 'quantity' | 'line_total'>) => void
  updateQty: (productId: number, qty: number) => void
  updateDiscount: (productId: number, discount: number) => void
  removeItem: (productId: number) => void
  setCustomer: (customer: CartCustomer | null) => void
  setDiscount: (type: 'percent' | 'fixed' | null, value: number) => void
  setTax: (enabled: boolean, rate: number) => void
  setNotes: (notes: string) => void
  clear: () => void
  loadDraft: (draft: { items: CartItem[]; customer: CartCustomer | null; discount_type: string | null; discount_value: number; tax_enabled: number; tax_rate: number; notes: string | null }) => void
}

function calcLineTotal(item: Pick<CartItem, 'unit_price' | 'quantity' | 'discount'>): number {
  return Math.max(0, (item.unit_price * item.quantity) - item.discount)
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer: null,
  discountType: null,
  discountValue: 0,
  taxEnabled: false,
  taxRate: 0,
  notes: '',

  subtotal: () => get().items.reduce((sum, i) => sum + i.line_total, 0),

  discountAmount: () => {
    const { discountType, discountValue, subtotal } = get()
    if (!discountType || !discountValue) return 0
    if (discountType === 'percent') return (subtotal() * discountValue) / 100
    return Math.min(discountValue, subtotal())
  },

  taxAmount: () => {
    const { taxEnabled, taxRate, subtotal, discountAmount } = get()
    if (!taxEnabled || !taxRate) return 0
    return ((subtotal() - discountAmount()) * taxRate) / 100
  },

  total: () => {
    const { subtotal, discountAmount, taxAmount } = get()
    return Math.max(0, subtotal() - discountAmount() + taxAmount())
  },

  addItem: (newItem) => {
    set(state => {
      const existing = state.items.find(i => i.product_id === newItem.product_id)
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product_id === newItem.product_id
              ? { ...i, quantity: i.quantity + 1, line_total: calcLineTotal({ ...i, quantity: i.quantity + 1 }) }
              : i
          )
        }
      }
      const item: CartItem = { ...newItem, quantity: 1, line_total: calcLineTotal({ ...newItem, quantity: 1 }) }
      return { items: [...state.items, item] }
    })
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) { get().removeItem(productId); return }
    set(state => ({
      items: state.items.map(i =>
        i.product_id === productId
          ? { ...i, quantity: qty, line_total: calcLineTotal({ ...i, quantity: qty }) }
          : i
      )
    }))
  },

  updateDiscount: (productId, discount) => {
    set(state => ({
      items: state.items.map(i =>
        i.product_id === productId
          ? { ...i, discount, line_total: calcLineTotal({ ...i, discount }) }
          : i
      )
    }))
  },

  removeItem: (productId) => set(state => ({ items: state.items.filter(i => i.product_id !== productId) })),

  setCustomer: (customer) => set({ customer }),

  setDiscount: (type, value) => set({ discountType: type, discountValue: value }),

  setTax: (enabled, rate) => set({ taxEnabled: enabled, taxRate: rate }),

  setNotes: (notes) => set({ notes }),

  clear: () => set({ items: [], customer: null, discountType: null, discountValue: 0, notes: '' }),

  loadDraft: (draft) => {
    set({
      items: draft.items,
      customer: draft.customer,
      discountType: (draft.discount_type as 'percent' | 'fixed' | null) ?? null,
      discountValue: draft.discount_value ?? 0,
      taxEnabled: Boolean(draft.tax_enabled),
      taxRate: draft.tax_rate ?? 0,
      notes: draft.notes ?? '',
    })
  },
}))
