import { create } from 'zustand'

export const DATE_FORMAT_OPTIONS = [
  'dd/mm/yyyy',
  'mm/dd/yyyy',
  'mm/dd/yy',
  'dd/mm/yy',
  'yyyy/mm/dd',
  'yyyy/dd/mm',
] as const

export type DateFormatOption = (typeof DATE_FORMAT_OPTIONS)[number]

const DEFAULT_DATE_FORMAT: DateFormatOption = 'dd/mm/yyyy'

interface DateFormatState {
  format: DateFormatOption
  setFormat: (format: DateFormatOption) => void
  syncFromSettings: (s: Record<string, string>) => void
}

function isDateFormatOption(value: string): value is DateFormatOption {
  return DATE_FORMAT_OPTIONS.includes(value as DateFormatOption)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDateByPattern(input: string | Date, format: DateFormatOption): string {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return String(input)

  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = String(d.getFullYear())
  const yy = yyyy.slice(-2)

  switch (format) {
    case 'dd/mm/yyyy':
      return `${dd}/${mm}/${yyyy}`
    case 'mm/dd/yyyy':
      return `${mm}/${dd}/${yyyy}`
    case 'mm/dd/yy':
      return `${mm}/${dd}/${yy}`
    case 'dd/mm/yy':
      return `${dd}/${mm}/${yy}`
    case 'yyyy/mm/dd':
      return `${yyyy}/${mm}/${dd}`
    case 'yyyy/dd/mm':
      return `${yyyy}/${dd}/${mm}`
    default:
      return `${dd}/${mm}/${yyyy}`
  }
}

export const useDateFormatStore = create<DateFormatState>((set) => ({
  format: DEFAULT_DATE_FORMAT,
  setFormat: (format) => set({ format: isDateFormatOption(format) ? format : DEFAULT_DATE_FORMAT }),
  syncFromSettings: (s) => {
    const raw = (s['date.format'] ?? '').trim().toLowerCase()
    set({ format: isDateFormatOption(raw) ? raw : DEFAULT_DATE_FORMAT })
  },
}))

export function getDateFormat(): DateFormatOption {
  return useDateFormatStore.getState().format
}
