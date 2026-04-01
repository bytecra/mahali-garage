import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Routes, Route, useSearchParams } from 'react-router-dom'
import { Plus, User, Phone, AlertCircle } from 'lucide-react'
import SearchInput from '../../components/shared/SearchInput'
import Pagination from '../../components/shared/Pagination'
import EmptyState from '../../components/shared/EmptyState'
import { usePermission } from '../../hooks/usePermission'
import { useDebounce } from '../../hooks/useDebounce'
import CurrencyText from '../../components/shared/CurrencyText'
import CustomerForm from './CustomerForm'
import CustomerProfile from './CustomerProfile'
import VehicleHistoryPage from './VehicleHistoryPage'

interface Customer {
  id: number; name: string; phone: string | null; email: string | null
  balance: number; sale_count: number; repair_count: number
}

function CustomerList(): JSX.Element {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const canEdit   = usePermission('customers.edit')

  const [items, setItems]     = useState<Customer[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [debtOnly, setDebtOnly] = useState(false)
  const dSearch               = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setFormOpen(true)
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.customers.list({ search: dSearch, with_debt: debtOnly, page })
    if (res.success) {
      const d = res.data as { items: Customer[]; total: number }
      setItems(d.items); setTotal(d.total)
    }
    setLoading(false)
  }, [dSearch, debtOnly, page])

  useEffect(() => { setPage(1) }, [dSearch, debtOnly])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('customers.title')}</h1>
        {canEdit && (
          <button onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" />{t('customers.addCustomer')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or phone…" className="w-72" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={debtOnly} onChange={e => setDebtOnly(e.target.checked)} className="accent-primary" />
          With debt only
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={User} title={t('common.noData')} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('customers.phone')}</th>
                  <th className="text-center px-4 py-3 font-medium">Sales</th>
                  <th className="text-center px-4 py-3 font-medium">Repairs</th>
                  <th className="text-end px-4 py-3 font-medium">{t('customers.balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(item => (
                  <tr key={item.id} onClick={() => navigate(`/owners/${item.id}`)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {item.name[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{item.phone}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{item.sale_count}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{item.repair_count}</td>
                    <td className="px-4 py-3 text-end">
                      {item.balance < 0 ? (
                        <span className="flex items-center justify-end gap-1 font-medium text-destructive">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <CurrencyText amount={Math.abs(item.balance)} /> owes
                        </span>
                      ) : item.balance > 0 ? (
                        <span className="font-medium text-green-600"><CurrencyText amount={item.balance} /> credit</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={25} total={total} onChange={setPage} />
        </>
      )}

      <CustomerForm
        open={formOpen}
        customerId={null}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
      />
    </div>
  )
}

export default function CustomersPage(): JSX.Element {
  return (
    <Routes>
      <Route index element={<CustomerList />} />
      <Route path=":customerId/vehicles/:vehicleId" element={<VehicleHistoryPage />} />
      <Route path=":id" element={<CustomerProfile />} />
    </Routes>
  )
}
