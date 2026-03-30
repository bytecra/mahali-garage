import { create } from 'zustand'

const DEFAULT_SYMBOL = 'د.إ'
const DEFAULT_CODE = 'AED'

interface CurrencyState {
  symbol: string
  code: string
  setSymbol: (symbol: string) => void
  syncFromSettings: (s: Record<string, string>) => void
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
  symbol: DEFAULT_SYMBOL,
  code: DEFAULT_CODE,

  setSymbol: (symbol) => set({ symbol: symbol || DEFAULT_SYMBOL }),

  syncFromSettings: (s) => {
    const sym = s['store.currency_symbol']
    const code = s['store.currency']
    set({
      symbol: sym && sym.length > 0 ? sym : DEFAULT_SYMBOL,
      code: code && code.trim().length > 0 ? code.trim() : DEFAULT_CODE,
    })
  },
}))

export function getCurrencySymbol(): string {
  return useCurrencyStore.getState().symbol
}

export function getCurrencyCode(): string {
  return useCurrencyStore.getState().code
}
