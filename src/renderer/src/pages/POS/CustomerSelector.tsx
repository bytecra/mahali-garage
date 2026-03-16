import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, UserPlus } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'
import { CartCustomer } from '../../store/cartStore'

interface Props {
  value: CartCustomer | null
  onChange: (customer: CartCustomer | null) => void
}

interface CustomerResult { id: number; name: string; phone: string | null; balance: number }

export default function CustomerSelector({ value, onChange }: Props): JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerResult[]>([])
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 250)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return }
    window.electronAPI.customers.search(debouncedQuery).then(res => {
      if (res.success) setResults(res.data as CustomerResult[])
    })
  }, [debouncedQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (value) {
    return (
      <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
        <div>
          <p className="text-sm font-medium text-foreground">{value.name}</p>
          {value.phone && <p className="text-xs text-muted-foreground">{value.phone}</p>}
          {value.balance < 0 && (
            <p className="text-xs text-destructive">Owes {Math.abs(value.balance).toFixed(2)}</p>
          )}
        </div>
        <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 border border-input rounded-md px-3 py-2 bg-background">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={t('customers.searchPlaceholder')}
          className="flex-1 text-sm bg-transparent outline-none"
        />
        <button
          onClick={() => { onChange({ id: 0, name: t('pos.walkIn'), phone: null, balance: 0 }); setOpen(false) }}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="Walk-in customer"
        >
          <UserPlus className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => { onChange({ id: c.id, name: c.name, phone: c.phone, balance: c.balance }); setQuery(''); setOpen(false) }}
              className="w-full text-start px-3 py-2 hover:bg-muted/60 text-sm"
            >
              <p className="font-medium">{c.name}</p>
              {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
