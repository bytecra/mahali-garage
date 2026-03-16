import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Phone, Mail, MapPin, Pencil, AlertCircle, CheckCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { usePermission } from '../../hooks/usePermission'
import { toast } from '../../store/notificationStore'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import CustomerForm from './CustomerForm'

interface CustomerDetail {
  id: number; name: string; phone: string | null; email: string | null
  address: string | null; notes: string | null; balance: number
  sale_count: number; repair_count: number
  sales: SaleRow[]; repairs: RepairRow[]
}

interface SaleRow {
  id: number; sale_number: string; total_amount: number; balance_due: number
  status: string; created_at: string; invoice_number: string | null
}

interface RepairRow {
  id: number; job_number: string; type: string; status: string
  device_brand: string | null; device_model: string | null
  final_cost: number; created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  partial:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  voided:    'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  draft:     'bg-muted text-muted-foreground',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  received:  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  in_progress: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
}

export default function CustomerProfile(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canEdit   = usePermission('customers.edit')
  const canDelete = usePermission('customers.delete')

  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [tab, setTab] = useState<'sales' | 'repairs'>('sales')

  const load = async () => {
    if (!id) return
    setLoading(true)
    const res = await window.electronAPI.customers.getById(Number(id))
    if (res.success) setCustomer(res.data as CustomerDetail)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const handleDelete = async () => {
    if (!customer) return
    const res = await window.electronAPI.customers.delete(customer.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    navigate('/customers')
  }

  if (loading) return (
    <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  )
  if (!customer) return (
    <div className="text-center py-16 text-muted-foreground">Customer not found</div>
  )

  return (
    <div>
      {/* Back */}
      <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary text-xl font-bold">
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{customer.name}</h1>
              <div className="flex flex-col gap-0.5 mt-1">
                {customer.phone && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Phone className="w-3.5 h-3.5" />{customer.phone}</span>}
                {customer.email && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Mail className="w-3.5 h-3.5" />{customer.email}</span>}
                {customer.address && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="w-3.5 h-3.5" />{customer.address}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">
                <Pencil className="w-3.5 h-3.5" />{t('common.edit')}
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeleteOpen(true)} className="px-3 py-1.5 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10">
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>

        {/* Balance & stats */}
        <div className="flex gap-6 mt-6 pt-5 border-t border-border">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Balance</p>
            {customer.balance < 0 ? (
              <p className="font-bold text-lg text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />{formatCurrency(Math.abs(customer.balance))}
              </p>
            ) : customer.balance > 0 ? (
              <p className="font-bold text-lg text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />{formatCurrency(customer.balance)}
              </p>
            ) : (
              <p className="font-bold text-lg text-foreground">—</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <p className="font-bold text-lg text-foreground">{customer.sale_count}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Repairs</p>
            <p className="font-bold text-lg text-foreground">{customer.repair_count}</p>
          </div>
        </div>

        {customer.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">{t('common.notes')}</p>
            <p className="text-sm text-foreground mt-1">{customer.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(['sales', 'repairs'] as const).map(t_ => (
          <button key={t_} onClick={() => setTab(t_)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t_ ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t_ === 'sales' ? t('customers.salesHistory') : t('customers.repairHistory')}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {customer.sales.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">No sales yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Invoice</th>
                  <th className="text-end px-4 py-3 font-medium">{t('common.total')}</th>
                  <th className="text-end px-4 py-3 font-medium">Balance Due</th>
                  <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('common.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customer.sales.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{s.invoice_number ?? s.sale_number}</td>
                    <td className="px-4 py-3 text-end font-medium">{formatCurrency(s.total_amount)}</td>
                    <td className="px-4 py-3 text-end">{s.balance_due > 0 ? <span className="text-destructive">{formatCurrency(s.balance_due)}</span> : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'repairs' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {customer.repairs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">No repairs yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Job #</th>
                  <th className="text-start px-4 py-3 font-medium">Device</th>
                  <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="text-end px-4 py-3 font-medium">Cost</th>
                  <th className="text-start px-4 py-3 font-medium">{t('common.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customer.repairs.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{r.job_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">{formatCurrency(r.final_cost)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <CustomerForm open={editOpen} customerId={customer.id} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load() }} />
      <ConfirmDialog open={deleteOpen} title={t('common.delete')} message={`Delete customer "${customer.name}"? All their records will remain but the customer profile will be removed.`}
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteOpen(false)} />
    </div>
  )
}
