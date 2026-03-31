import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getCurrencySymbol } from '../store/currencyStore'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined, symbol?: string): string {
  const n = Number(amount ?? 0)
  const sym = symbol ?? getCurrencySymbol()
  const safe = isNaN(n) ? 0 : n
  const sign = safe < 0 ? '-' : ''
  const absFormatted = Math.abs(safe).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${absFormatted}${sym}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

export function generateSaleNumber(prefix: string, num: number): string {
  const padded = String(num).padStart(4, '0')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${prefix}-${date}-${padded}`
}
