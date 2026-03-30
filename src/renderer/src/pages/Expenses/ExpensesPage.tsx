import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Edit2, Search, Receipt, ExternalLink, Tag, CalendarClock } from 'lucide-react'
import Modal from '../../components/shared/Modal'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'
import { formatCurrency } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'
import { FeatureGate } from '../../components/FeatureGate'

interface Category { id: number; name: string; color: string }
interface Expense {
  id: number; name: string
  category_id: number | null; category_name: string | null; category_color: string | null
  amount: number; date: string; due_date: string | null; is_paid: number
  department: string | null
  branch: string | null; notes: string | null
  user_id: number | null; full_name: string | null; receipt_path: string | null
}

const today = new Date().toISOString().slice(0, 10)
const monthStart = today.slice(0, 7) + '-01'

const EMPTY_FORM = {
  name: '', category_id: '' as string | number, amount: '',
  date: today, due_date: '', department: '' as '' | 'mechanical' | 'programming' | 'both',
  branch: '', notes: '', receipt_path: '',
}

type Tab = 'expenses' | 'categories'

export default function ExpensesPage(): JSX.Element {
  return (
    <FeatureGate feature="expenses.view">
      <ExpensesPageInner />
    </FeatureGate>
  )
}

function ExpensesPageInner(): JSX.Element {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const canAdd      = usePermission('expenses.add')
  const canDelete   = usePermission('expenses.delete')
  const canManageCat = usePermission('expenses.manage_categories')

  const [tab, setTab] = useState<Tab>('expenses')

  // ── Expenses state ───────────────────────────────────────────────────────
  const [expenses, setExpenses]   = useState<Expense[]>([])
  const [total, setTotal]         = useState(0)
  const [periodTotal, setPeriodTotal] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState<number | ''>('')
  const [dateFrom, setDateFrom]   = useState(monthStart)
  const [dateTo, setDateTo]       = useState(today)
  const [categories, setCategories] = useState<Category[]>([])

  // ── Expense modal ────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]   = useState(false)
  const [editId, setEditId]         = useState<number | null>(null)
  const [form, setForm]             = useState({ ...EMPTY_FORM })
  const [saving, setSaving]         = useState(false)
  const [deleteId, setDeleteId]     = useState<number | null>(null)

  // ── Category modal ───────────────────────────────────────────────────────
  const [catModalOpen, setCatModalOpen]   = useState(false)
  const [catEditId, setCatEditId]         = useState<number | null>(null)
  const [catForm, setCatForm]             = useState({ name: '', color: '#6366f1' })
  const [catSaving, setCatSaving]         = useState(false)
  const [catDeleteId, setCatDeleteId]     = useState<number | null>(null)

  const loadCategories = useCallback(async () => {
    const res = await window.electronAPI.expenseCategories.list()
    if (res.success) setCategories(res.data as Category[])
  }, [])

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.expenses.list({
      from: dateFrom || undefined,
      to:   dateTo   || undefined,
      category_id: catFilter || undefined,
      search: search || undefined,
      limit: 200,
    })
    setLoading(false)
    if (res.success) {
      const d = res.data as { rows: Expense[]; total: number }
      setExpenses(d.rows)
      setTotal(d.total)
      setPeriodTotal(d.rows.reduce((s, e) => s + e.amount, 0))
    }
  }, [dateFrom, dateTo, catFilter, search])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { if (tab === 'expenses') loadExpenses() }, [tab, loadExpenses])

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  const openEdit = (e: Expense) => {
    setEditId(e.id)
    setForm({
      name: e.name, category_id: e.category_id ?? '',
      amount: String(e.amount), date: e.date,
      due_date: e.due_date ?? '',
      department: (e.department === 'mechanical' || e.department === 'programming' || e.department === 'both' ? e.department : ''),
      branch: e.branch ?? '', notes: e.notes ?? '',
      receipt_path: e.receipt_path ?? '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim())    { toast.error(t('expenses.nameRequired'));   return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error(t('expenses.amountRequired')); return }
    if (!form.date)           { toast.error(t('expenses.dateRequired'));   return }
    setSaving(true)
    const data = {
      name:        form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      amount:      Number(form.amount),
      date:        form.date,
      due_date:    form.due_date || null,
      department:  form.department || null,
      branch:      form.branch.trim() || null,
      notes:       form.notes.trim()  || null,
      receipt_path: form.receipt_path || null,
    }
    const res = editId
      ? await window.electronAPI.expenses.update(editId, data)
      : await window.electronAPI.expenses.create(data)
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setModalOpen(false)
    loadExpenses()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const res = await window.electronAPI.expenses.delete(deleteId)
    setDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.deleted'))
    loadExpenses()
  }

  const handleSelectReceipt = async () => {
    const res = await window.electronAPI.expenses.selectReceipt()
    if (res.success && res.data) setForm(f => ({ ...f, receipt_path: res.data as string }))
  }

  // ── Category handlers ────────────────────────────────────────────────────
  const openCatAdd = () => { setCatEditId(null); setCatForm({ name: '', color: '#6366f1' }); setCatModalOpen(true) }
  const openCatEdit = (c: Category) => { setCatEditId(c.id); setCatForm({ name: c.name, color: c.color }); setCatModalOpen(true) }

  const handleCatSave = async () => {
    if (!catForm.name.trim()) { toast.error(t('expenses.categoryNameRequired')); return }
    setCatSaving(true)
    const res = catEditId
      ? await window.electronAPI.expenseCategories.update(catEditId, catForm)
      : await window.electronAPI.expenseCategories.create(catForm)
    setCatSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setCatModalOpen(false)
    loadCategories()
  }

  const handleCatDelete = async () => {
    if (!catDeleteId) return
    const res = await window.electronAPI.expenseCategories.delete(catDeleteId)
    setCatDeleteId(null)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.deleted'))
    loadCategories()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const labelCls = 'block text-sm font-medium mb-1'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('expenses.title')}</h1>
        {canAdd && tab === 'expenses' && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" />{t('expenses.addExpense')}
          </button>
        )}
        {canManageCat && tab === 'categories' && (
          <button onClick={openCatAdd}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" />{t('expenses.addCategory')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(['expenses', 'categories'] as Tab[]).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t(`expenses.tab.${tb}`)}
          </button>
        ))}
      </div>

      {/* ── EXPENSES TAB ─────────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('common.search')}
                className="w-full ps-9 pe-4 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : '')}
              className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">{t('expenses.allCategories')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={loadExpenses}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              {t('common.search')}
            </button>
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between bg-muted/40 border border-border rounded-lg px-4 py-2.5 mb-4 text-sm">
            <span className="text-muted-foreground">{total} {t('expenses.records')}</span>
            <span className="font-bold text-destructive">{t('expenses.total')}: {formatCurrency(periodTotal)}</span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">{t('common.noData')}</div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium">{t('common.date')}</th>
                    <th className="text-start px-4 py-3 font-medium">Due Date</th>
                    <th className="text-start px-4 py-3 font-medium">{t('expenses.expenseName')}</th>
                    <th className="text-start px-4 py-3 font-medium">{t('expenses.category')}</th>
                    <th className="text-start px-4 py-3 font-medium">{t('expenses.branch')}</th>
                    <th className="text-end px-4 py-3 font-medium">{t('expenses.amount')}</th>
                    <th className="text-start px-4 py-3 font-medium">{t('expenses.recordedBy')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expenses.map(e => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {e.due_date ? (
                          <span className={`inline-flex items-center gap-1 font-medium ${
                            e.is_paid ? 'text-muted-foreground line-through' :
                            e.due_date < today ? 'text-red-500' : 'text-orange-500'
                          }`}>
                            <CalendarClock className="w-3 h-3" />
                            {e.due_date}
                            {e.is_paid && <span className="text-green-500 no-underline not-italic ml-1">✓</span>}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div>{e.name}</div>
                        {e.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{e.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {e.category_name ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: e.category_color ?? '#6b7280' }}>
                            <Tag className="w-2.5 h-2.5" />{e.category_name}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{e.branch ?? '—'}</td>
                      <td className="px-4 py-3 text-end font-bold text-destructive">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div>{e.full_name ?? '—'}</div>
                        {e.receipt_path && (
                          <button onClick={() => window.electronAPI.expenses.openReceipt(e.receipt_path!)}
                            className="flex items-center gap-1 text-primary hover:underline mt-0.5">
                            <Receipt className="w-3 h-3" />{t('expenses.viewReceipt')}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canAdd && (
                            <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteId(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── CATEGORIES TAB ───────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full shrink-0 border-2 border-white shadow-sm" style={{ backgroundColor: c.color }} />
              <span className="flex-1 font-medium text-sm">{c.name}</span>
              {canManageCat && (
                <div className="flex items-center gap-1">
                  <button onClick={() => openCatEdit(c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setCatDeleteId(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">{t('common.noData')}</div>
          )}
        </div>
      )}

      {/* ── Add/Edit Expense Modal ───────────────────────────────────────── */}
      <Modal open={modalOpen} title={editId ? t('expenses.editExpense') : t('expenses.addExpense')} onClose={() => setModalOpen(false)} size="lg"
        footer={<>
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>{t('expenses.expenseName')} *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder={t('expenses.expenseNamePlaceholder')} />
          </div>
          <div>
            <label className={labelCls}>{t('expenses.category')}</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className={inputCls}>
              <option value="">— {t('expenses.noCategory')} —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('expenses.amount')} *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('reports.department', { defaultValue: 'Department' })}</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as typeof f.department }))} className={inputCls}>
              <option value="">{t('expenses.deptShared', { defaultValue: 'Shared (both departments)' })}</option>
              <option value="mechanical">{t('reports.dept.mechanical', { defaultValue: 'Mechanical' })}</option>
              <option value="programming">{t('reports.dept.programming', { defaultValue: 'Programming' })}</option>
              <option value="both">{t('expenses.deptBoth', { defaultValue: 'Both' })}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('common.date')} *</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due Date <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('expenses.branch')}</label>
            <input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} className={inputCls} placeholder={t('expenses.branchPlaceholder')} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t('common.notes')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t('expenses.receipt')}</label>
            <div className="flex items-center gap-2">
              <input readOnly value={form.receipt_path} placeholder={t('expenses.noReceipt')}
                className={inputCls + ' flex-1 bg-muted/50 cursor-default text-xs'} />
              <button type="button" onClick={handleSelectReceipt}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted whitespace-nowrap shrink-0">
                <Receipt className="w-4 h-4" />{t('expenses.browse')}
              </button>
              {form.receipt_path && (
                <button type="button" onClick={() => setForm(f => ({ ...f, receipt_path: '' }))}
                  className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {/* Recorded by — read only, shows current user */}
          <div className="col-span-2">
            <label className={labelCls}>{t('expenses.recordedBy')}</label>
            <input readOnly value={user?.fullName ?? user?.username ?? '—'} className={inputCls + ' bg-muted/50 cursor-default'} />
          </div>
        </div>
      </Modal>

      {/* ── Delete Expense Confirm ───────────────────────────────────────── */}
      <Modal open={!!deleteId} title={t('common.confirmDelete')} onClose={() => setDeleteId(null)} size="sm"
        footer={<>
          <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleDelete} className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</button>
        </>}
      >
        <p className="text-sm text-muted-foreground">{t('common.deleteConfirmMsg')}</p>
      </Modal>

      {/* ── Add/Edit Category Modal ──────────────────────────────────────── */}
      <Modal open={catModalOpen} title={catEditId ? t('expenses.editCategory') : t('expenses.addCategory')} onClose={() => setCatModalOpen(false)} size="sm"
        footer={<>
          <button onClick={() => setCatModalOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleCatSave} disabled={catSaving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {catSaving ? t('common.loading') : t('common.save')}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t('expenses.categoryName')} *</label>
            <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('expenses.categoryColor')}</label>
            <div className="flex items-center gap-3">
              <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))}
                className="w-10 h-10 rounded-md border border-input cursor-pointer bg-background" />
              <input value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))}
                className={inputCls + ' font-mono'} placeholder="#6366f1" />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Delete Category Confirm ──────────────────────────────────────── */}
      <Modal open={!!catDeleteId} title={t('common.confirmDelete')} onClose={() => setCatDeleteId(null)} size="sm"
        footer={<>
          <button onClick={() => setCatDeleteId(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleCatDelete} className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</button>
        </>}
      >
        <p className="text-sm text-muted-foreground">{t('expenses.deleteCategoryWarning')}</p>
      </Modal>
    </div>
  )
}
