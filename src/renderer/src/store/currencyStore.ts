import { create } from 'zustand'

const DEFAULT_SYMBOL = 'د.إ'

interface CurrencyState {
  symbol: string
  setSymbol: (symbol: string) => void
  syncFromSettings: (s: Record<string, string>) => void
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
  symbol: DEFAULT_SYMBOL,

  setSymbol: (symbol) => set({ symbol: symbol || DEFAULT_SYMBOL }),

  syncFromSettings: (s) => {
    const sym = s['store.currency_symbol']
    set({ symbol: sym && sym.length > 0 ? sym : DEFAULT_SYMBOL })
  },
}))

export function getCurrencySymbol(): string {
  return useCurrencyStore.getState().symbol
}
