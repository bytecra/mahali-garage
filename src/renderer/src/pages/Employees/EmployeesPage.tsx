import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Search, Users, Edit, Trash2, FileText, CalendarPlus,
  AlertTriangle, Eye, Upload, X, ChevronDown, ChevronUp, Wallet,
  CalendarDays,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Employee {
  id: number
  employee_id: string
  full_name: string
  nationality: string | null
  national_id: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  address: string | null
  role: string
  department: string | null
  hire_date: string
  employment_status: string
  salary: number | null
  salary_currency: string | null
  payment_frequency: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  is_on_vacation: number
  current_vacation_start: string | null
  current_vacation_end: string | null
  notes: string | null
  document_count: number
  vacation_count: number
}

type SalaryTypeOpt = 'monthly' | 'weekly' | 'daily' | 'one_time' | 'custom'

interface EmployeeSalaryConfig {
  id: number
  employee_id: number
  salary_type: SalaryTypeOpt
  amount: number
  payment_day: number | null
  start_date: string
  notes: string | null
  custom_period: string | null
  created_at: string
}

interface PayrollRow {
  employee_id: number
  full_name: string
  employee_code: string
  salary_type: SalaryTypeOpt
  amount: number
  payment_day: number | null
  month_status: 'paid' | 'unpaid' | 'overdue'
  carryover_amount: number
  current_period_amount: number
  total_due: number
  period_label: string
}

interface Vacation {
  id: number
  employee_id: number
  vacation_type: string
  start_date: string
  end_date: string
  actual_return_date: string | null
  status: string
  reason: string | null
  approved_by_name: string | null
}

interface EmpDocument {
  id: number
  employee_id: number
  document_type: string
  document_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  issue_date: string | null
  expiry_date: string | null
  document_number: string | null
  notes: string | null
  uploaded_by_name: string | null
  uploaded_at: string
}

/* ── Constants ───────────────────────────────────────────────────────────── */

const ROLES = ['Technician', 'Cashier', 'Manager', 'Supervisor', 'Admin', 'Helper', 'Driver', 'Other']
const DEPARTMENTS = ['Service', 'Sales', 'Admin', 'Parts', 'Operations']
const VACATION_TYPES = ['annual', 'sick', 'unpaid', 'emergency']
const DOC_TYPES = [
  'passport', 'national_id', 'visa', 'contract',
  'certificate', 'medical', 'driving_license', 'other',
]

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  on_leave: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  resigned: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  terminated: 'bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-400',
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const btn = 'px-4 py-2 text-sm rounded-md font-medium transition-colors disabled:opacity-50'
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`
const btnOutline = `${btn} border border-border hover:bg-accent`
const btnDanger = `${btn} bg-destructive text-destructive-foreground hover:bg-destructive/90`
const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
const labelCls = 'block text-sm font-medium text-foreground mb-1'

function PayrollSection({
  rows,
  loading,
  filter,
  setFilter,
  onRefresh,
  t,
}: {
  rows: PayrollRow[]
  loading: boolean
  filter: 'all' | 'paid' | 'unpaid' | 'overdue'
  setFilter: (f: 'all' | 'paid' | 'unpaid' | 'overdue') => void
  onRefresh: () => void
  t: (key: string, opts?: { defaultValue?: string }) => string
}) {
  const filters = ['all', 'paid', 'unpaid', 'overdue'] as const

  async function markPaid(employeeId: number) {
    const res = await window.electronAPI.employees.markSalaryPaid(employeeId) as { success: boolean; error?: string }
    if (!res.success) {
      window.alert(res.error ?? t('common.error'))
      return
    }
    onRefresh()
  }

  function statusLabel(s: PayrollRow['month_status']): string {
    if (s === 'paid') return `${t('employees.payrollPaid', { defaultValue: 'Paid' })} ✓`
    if (s === 'overdue') return `${t('employees.payrollOverdue', { defaultValue: 'Overdue' })} ⚠`
    return `${t('employees.payrollUnpaid', { defaultValue: 'Unpaid' })} ✗`
  }

  return (
    <div className="mb-8">
      <p className="text-sm text-muted-foreground mb-4">
        {t('employees.payrollIntro', { defaultValue: 'This month’s payroll status and amounts due (carryover from earlier unpaid periods is included).' })}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {t(`employees.payroll_filter_${f}`, { defaultValue: f.charAt(0).toUpperCase() + f.slice(1) })}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {t('employees.payrollEmpty', { defaultValue: 'No employees with salary configuration match this filter.' })}
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(row => (
            <div
              key={row.employee_id}
              className="bg-card border border-border rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{row.full_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{row.employee_code}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t(`employees.salaryType_${row.salary_type}`, { defaultValue: row.salary_type })}
                  {' · '}
                  <span className="text-foreground font-medium">
                    {t('employees.amountAed', { defaultValue: 'د.إ' })} {row.amount.toLocaleString()}
                  </span>
                  {row.month_status !== 'paid' && row.carryover_amount > 0 && (
                    <span className="ml-2 text-amber-700 dark:text-amber-400">
                      {t('employees.carryoverLabel', { defaultValue: 'Carryover' })}: د.إ {row.carryover_amount.toLocaleString()}
                      {' → '}
                      <span className="font-semibold">{t('employees.totalDue', { defaultValue: 'Total' })}: د.إ {row.total_due.toLocaleString()}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2">
                <span className="text-sm font-medium">{statusLabel(row.month_status)}</span>
                <span className="text-xs text-muted-foreground">{row.period_label}</span>
                {row.month_status !== 'paid' && row.total_due > 0 && (
                  <button type="button" onClick={() => markPaid(row.employee_id)} className={btnPrimary}>
                    {t('employees.markSalaryPaid', { defaultValue: 'Mark as paid' })}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ── EmployeesPage ───────────────────────────────────────────────────────── */

export default function EmployeesPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [pageSection, setPageSection] = useState<'list' | 'payroll'>('list')
  const [payrollFilter, setPayrollFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>('all')
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([])
  const [payrollLoading, setPayrollLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)

  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null)
  const [viewTab, setViewTab] = useState<
    'personal' | 'employment' | 'salary' | 'vacation' | 'attendance' | 'documents'
  >('personal')

  if (user?.role !== 'owner') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground">{t('common.forbidden')}</h2>
          <p className="text-muted-foreground mt-1">{t('employees.ownerOnly')}</p>
        </div>
      </div>
    )
  }

  const load = useCallback(async () => {
    try {
      const res = await window.electronAPI.employees.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
      }) as { success: boolean; data?: Employee[] }
      if (res.success && res.data) setEmployees(res.data)
    } catch { /* */ } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  const loadPayroll = useCallback(async () => {
    setPayrollLoading(true)
    try {
      const res = await window.electronAPI.employees.listPayroll(payrollFilter) as { success: boolean; data?: PayrollRow[] }
      if (res.success && res.data) setPayrollRows(res.data)
    } catch { /* */ } finally {
      setPayrollLoading(false)
    }
  }, [payrollFilter])

  useEffect(() => {
    if (pageSection === 'payroll') loadPayroll()
  }, [pageSection, loadPayroll])

  function openCreate() {
    setEditEmployee(null)
    setShowForm(true)
  }

  function openEdit(emp: Employee) {
    setEditEmployee(emp)
    setShowForm(true)
  }

  function openView(emp: Employee) {
    setViewEmployee(emp)
    setViewTab('personal')
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(t('employees.confirmDelete', { name: emp.full_name }))) return
    await window.electronAPI.employees.delete(emp.id)
    load()
  }

  const statuses = ['all', 'active', 'on_leave', 'resigned', 'terminated']

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6" /> {t('employees.title')}
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-56"
              placeholder={t('employees.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={openCreate} className={btnPrimary}>
            <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> {t('employees.addEmployee')}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setPageSection('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            pageSection === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('employees.tabList', { defaultValue: 'Directory' })}
        </button>
        <button
          type="button"
          onClick={() => setPageSection('payroll')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            pageSection === 'payroll' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wallet className="w-4 h-4" />
          {t('employees.payrollTab', { defaultValue: 'Payroll' })}
        </button>
      </div>

      {pageSection === 'payroll' && (
        <PayrollSection
          rows={payrollRows}
          loading={payrollLoading}
          filter={payrollFilter}
          setFilter={setPayrollFilter}
          onRefresh={loadPayroll}
          t={t}
        />
      )}

      {/* Filter tabs */}
      {pageSection === 'list' && (
      <div className="flex gap-2 mb-6 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {t(`employees.status_${s}`)}
          </button>
        ))}
      </div>
      )}

      {/* List */}
      {pageSection === 'list' && loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : pageSection === 'list' && employees.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {t('employees.noEmployees')}
        </div>
      ) : pageSection === 'list' ? (
        <div className="grid gap-3">
          {employees.map(emp => (
            <div key={emp.id} className="bg-card border border-border rounded-lg px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              {/* Avatar/initials */}
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{emp.full_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{emp.employee_id}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
                  <span>{emp.role}</span>
                  {emp.department && <><span className="text-border">|</span><span>{emp.department}</span></>}
                  {emp.phone && <><span className="text-border">|</span><span>{emp.phone}</span></>}
                </div>
                {emp.is_on_vacation === 1 && emp.current_vacation_end && (
                  <div className="mt-1 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                    {t('employees.onVacationUntil', { date: new Date(emp.current_vacation_end).toLocaleDateString() })}
                    {daysUntil(emp.current_vacation_end) > 0 && (
                      <span className="ml-1">({daysUntil(emp.current_vacation_end)} {t('employees.daysRemaining')})</span>
                    )}
                  </div>
                )}
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[emp.employment_status] || ''}`}>
                {t(`employees.status_${emp.employment_status}`)}
              </span>

              {/* Badges */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {emp.document_count > 0 && (
                  <span className="flex items-center gap-1" title={t('employees.documents')}>
                    <FileText className="w-3.5 h-3.5" /> {emp.document_count}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button onClick={() => openView(emp)} className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title={t('common.view')}>
                  <Eye className="w-4 h-4" />
                </button>
                <button onClick={() => openEdit(emp)} className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title={t('common.edit')}>
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(emp)} className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('common.delete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Employee Form Modal */}
      {showForm && (
        <EmployeeFormModal
          employee={editEmployee}
          onClose={() => { setShowForm(false); load() }}
        />
      )}

      {/* Employee Detail View Modal */}
      {viewEmployee && (
        <EmployeeViewModal
          employee={viewEmployee}
          tab={viewTab}
          setTab={setViewTab}
          onClose={() => setViewEmployee(null)}
          onRefresh={async () => {
            const res = await window.electronAPI.employees.getById(viewEmployee.id) as { success: boolean; data?: Employee }
            if (res.success && res.data) setViewEmployee(res.data)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE FORM MODAL (Create / Edit)
   ═══════════════════════════════════════════════════════════════════════════ */

function EmployeeFormModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { t } = useTranslation()
  const isEdit = !!employee

  const [form, setForm] = useState({
    full_name: employee?.full_name ?? '',
    nationality: employee?.nationality ?? '',
    national_id: employee?.national_id ?? '',
    date_of_birth: employee?.date_of_birth ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    address: employee?.address ?? '',
    role: employee?.role ?? 'Technician',
    department: employee?.department ?? '',
    hire_date: employee?.hire_date ?? new Date().toISOString().split('T')[0],
    employment_status: employee?.employment_status ?? 'active',
    emergency_contact_name: employee?.emergency_contact_name ?? '',
    emergency_contact_phone: employee?.emergency_contact_phone ?? '',
    emergency_contact_relation: employee?.emergency_contact_relation ?? '',
    notes: employee?.notes ?? '',
  })
  const [salaryForm, setSalaryForm] = useState({
    salary_type: 'monthly' as SalaryTypeOpt,
    amount: employee?.salary != null ? String(employee.salary) : '',
    payment_day: 1,
    start_date: employee?.hire_date ?? new Date().toISOString().split('T')[0],
    notes: '',
    custom_period: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [section, setSection] = useState<'personal' | 'employment' | 'salary' | 'emergency'>('personal')

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!employee?.id) return
    async function loadSalary() {
      const res = await window.electronAPI.employees.getSalary(employee!.id) as { success: boolean; data?: EmployeeSalaryConfig | null }
      if (res.success && res.data) {
        const d = res.data
        setSalaryForm({
          salary_type: d.salary_type,
          amount: String(d.amount),
          payment_day: d.payment_day ?? 1,
          start_date: d.start_date,
          notes: d.notes ?? '',
          custom_period: d.custom_period ?? '',
        })
      }
    }
    loadSalary()
  }, [employee?.id])

  async function handleSave() {
    if (!form.full_name.trim()) return setError(t('employees.nameRequired'))
    if (!form.role) return setError(t('employees.roleRequired'))
    if (!form.hire_date) return setError(t('employees.hireDateRequired'))

    setSaving(true)
    setError('')
    try {
      const payload = { ...form }
      let empId: number
      if (isEdit) {
        const res = await window.electronAPI.employees.update(employee!.id, payload) as { success: boolean }
        if (!res.success) throw new Error('update')
        empId = employee!.id
      } else {
        const res = await window.electronAPI.employees.create(payload) as { success: boolean; data?: Employee }
        if (!res.success || !res.data) throw new Error('create')
        empId = res.data.id
      }

      const amt = Number(salaryForm.amount)
      if (!Number.isNaN(amt) && amt > 0) {
        const resSal = await window.electronAPI.employees.upsertSalary({
          employee_id: empId,
          salary_type: salaryForm.salary_type,
          amount: amt,
          payment_day: ['monthly', 'custom'].includes(salaryForm.salary_type) ? (Number(salaryForm.payment_day) || 1) : null,
          start_date: salaryForm.start_date || form.hire_date,
          notes: salaryForm.notes.trim() ? salaryForm.notes : null,
          custom_period: salaryForm.salary_type === 'custom' ? (salaryForm.custom_period.trim() || null) : null,
        }) as { success: boolean }
        if (!resSal.success) throw new Error('salary')
      }

      onClose()
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const sections = ['personal', 'employment', 'salary', 'emergency'] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? t('employees.editEmployee') : t('employees.addEmployee')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-border px-6">
          {sections.map(s => (
            <button key={s} onClick={() => setSection(s)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                section === s
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t(`employees.section_${s}`)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
          )}

          {section === 'personal' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.fullName')} *</label>
                <input className={inputCls} value={form.full_name} onChange={e => set('full_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.nationality')}</label>
                <input className={inputCls} value={form.nationality} onChange={e => set('nationality', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.nationalId')}</label>
                <input className={inputCls} value={form.national_id} onChange={e => set('national_id', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.dateOfBirth')}</label>
                <input type="date" className={inputCls} value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.phone')}</label>
                <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.email')}</label>
                <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.address')}</label>
                <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} />
              </div>
            </div>
          )}

          {section === 'employment' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('employees.role')} *</label>
                <select className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('employees.department')}</label>
                <select className={inputCls} value={form.department} onChange={e => set('department', e.target.value)}>
                  <option value="">—</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('employees.hireDate')} *</label>
                <input type="date" className={inputCls} value={form.hire_date} onChange={e => set('hire_date', e.target.value)} />
              </div>
              {isEdit && (
                <div>
                  <label className={labelCls}>{t('employees.status')}</label>
                  <select className={inputCls} value={form.employment_status} onChange={e => set('employment_status', e.target.value)}>
                    {['active', 'on_leave', 'resigned', 'terminated'].map(s => (
                      <option key={s} value={s}>{t(`employees.status_${s}`)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.notes')}</label>
                <textarea className={inputCls} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}

          {section === 'salary' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.salaryType', { defaultValue: 'Salary type' })}</label>
                <select
                  className={inputCls}
                  value={salaryForm.salary_type}
                  onChange={e => setSalaryForm(s => ({ ...s, salary_type: e.target.value as SalaryTypeOpt }))}
                >
                  <option value="monthly">{t('employees.salaryType_monthly', { defaultValue: 'Monthly' })}</option>
                  <option value="weekly">{t('employees.salaryType_weekly', { defaultValue: 'Weekly' })}</option>
                  <option value="daily">{t('employees.salaryType_daily', { defaultValue: 'Daily' })}</option>
                  <option value="one_time">{t('employees.salaryType_one_time', { defaultValue: 'One time' })}</option>
                  <option value="custom">{t('employees.salaryType_custom', { defaultValue: 'Custom' })}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('employees.salaryAmount', { defaultValue: 'Amount (د.إ)' })}</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputCls}
                  value={salaryForm.amount}
                  onChange={e => setSalaryForm(s => ({ ...s, amount: e.target.value }))}
                />
              </div>
              {(salaryForm.salary_type === 'monthly' || salaryForm.salary_type === 'custom') && (
                <div>
                  <label className={labelCls}>{t('employees.paymentDayOfMonth', { defaultValue: 'Payment day (1–31)' })}</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={inputCls}
                    value={salaryForm.payment_day}
                    onChange={e => setSalaryForm(s => ({ ...s, payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))}
                  />
                </div>
              )}
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.salaryStartDate', { defaultValue: 'Salary start date' })}</label>
                <input
                  type="date"
                  className={inputCls}
                  value={salaryForm.start_date}
                  onChange={e => setSalaryForm(s => ({ ...s, start_date: e.target.value }))}
                />
              </div>
              {salaryForm.salary_type === 'custom' && (
                <div className="col-span-2">
                  <label className={labelCls}>{t('employees.customPeriod', { defaultValue: 'Custom period description' })}</label>
                  <input
                    className={inputCls}
                    value={salaryForm.custom_period}
                    onChange={e => setSalaryForm(s => ({ ...s, custom_period: e.target.value }))}
                  />
                </div>
              )}
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.salaryNotes', { defaultValue: 'Salary notes' })}</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={salaryForm.notes}
                  onChange={e => setSalaryForm(s => ({ ...s, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {section === 'emergency' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('employees.emergencyContactName')}</label>
                <input className={inputCls} value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.emergencyContactPhone')}</label>
                <input className={inputCls} value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('employees.emergencyContactRelation')}</label>
                <input className={inputCls} value={form.emergency_contact_relation} onChange={e => set('emergency_contact_relation', e.target.value)} placeholder={t('employees.relationPlaceholder')} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className={btnOutline}>{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? t('common.saving') : isEdit ? t('common.save') : t('employees.addEmployee')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE VIEW MODAL (Details + Vacations + Documents)
   ═══════════════════════════════════════════════════════════════════════════ */

interface ViewProps {
  employee: Employee
  tab: 'personal' | 'employment' | 'salary' | 'vacation' | 'attendance' | 'documents'
  setTab: (
    tab: 'personal' | 'employment' | 'salary' | 'vacation' | 'attendance' | 'documents'
  ) => void
  onClose: () => void
  onRefresh: () => void
}

function EmployeeViewModal({ employee, tab, setTab, onClose, onRefresh }: ViewProps) {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const [vacations, setVacations] = useState<Vacation[]>([])
  const [documents, setDocuments] = useState<EmpDocument[]>([])
  const [salaryCfg, setSalaryCfg] = useState<EmployeeSalaryConfig | null>(null)
  const [showVacForm, setShowVacForm] = useState(false)
  const [showDocUpload, setShowDocUpload] = useState(false)

  const [attendanceYear, setAttendanceYear] = useState(() => new Date().getFullYear())
  const [attendanceMonth, setAttendanceMonth] = useState(() => new Date().getMonth() + 1)
  const [attendanceRecords, setAttendanceRecords] = useState<
    Array<{
      id: number
      date: string
      status_type_id: number
      status_name: string
      status_color: string
      status_emoji: string
      notes: string | null
      marked_by_name: string | null
      marked_at: string
    }>
  >([])
  const [attendanceSummary, setAttendanceSummary] = useState<{
    total_working_days: number
    present_days: number
    attendance_rate: number
    by_status: Array<{
      status_name: string
      status_color: string
      status_emoji: string
      count: number
    }>
  } | null>(null)
  const [attendanceStatuses, setAttendanceStatuses] = useState<
    Array<{ id: number; name: string; color: string; emoji: string | null }>
  >([])
  const [markMode, setMarkMode] = useState<'single' | 'range'>('single')
  const [markingDate, setMarkingDate] = useState('')
  const [markingDateTo, setMarkingDateTo] = useState('')
  const [markingStatusId, setMarkingStatusId] = useState<number | null>(null)
  const [markingNotes, setMarkingNotes] = useState('')
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    loadVacations()
    loadDocuments()
  }, [employee.id])

  useEffect(() => {
    async function loadSalary() {
      const res = await window.electronAPI.employees.getSalary(employee.id) as { success: boolean; data?: EmployeeSalaryConfig | null }
      if (res.success) setSalaryCfg(res.data ?? null)
    }
    loadSalary()
  }, [employee.id])

  async function loadVacations() {
    const res = await window.electronAPI.employees.listVacations(employee.id) as { success: boolean; data?: Vacation[] }
    if (res.success && res.data) setVacations(res.data)
  }

  async function loadDocuments() {
    const res = await window.electronAPI.employees.listDocuments(employee.id) as { success: boolean; data?: EmpDocument[] }
    if (res.success && res.data) setDocuments(res.data)
  }

  const loadAttendance = useCallback(async (): Promise<void> => {
    setAttendanceLoading(true)
    try {
      const [records, summary, statuses] = await Promise.all([
        window.electronAPI.attendance.getMonthly(employee.id, attendanceYear, attendanceMonth),
        window.electronAPI.attendance.getSummary(employee.id, attendanceYear, attendanceMonth),
        window.electronAPI.attendance.getStatuses(),
      ])
      if (records.success) setAttendanceRecords(records.data ?? [])
      if (summary.success) setAttendanceSummary(summary.data ?? null)
      if (statuses.success)
        setAttendanceStatuses(
          (statuses.data ?? []).map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            emoji: s.emoji,
          }))
        )
    } finally {
      setAttendanceLoading(false)
    }
  }, [employee, attendanceYear, attendanceMonth])

  useEffect(() => {
    if (tab !== 'attendance') return
    void loadAttendance()
  }, [tab, loadAttendance])

  async function handleMarkAttendance(): Promise<void> {
    if (!markingDate || !markingStatusId || !employee || !user?.userId) return
    if (markMode === 'range' && !markingDateTo) return
    try {
      if (markMode === 'single') {
        const res = await window.electronAPI.attendance.mark({
          employee_id: employee.id,
          date: markingDate,
          status_type_id: markingStatusId,
          notes: markingNotes || undefined,
        })
        if (!res.success) {
          window.alert(res.error ?? t('common.error'))
          return
        }
      } else {
        const dates: string[] = []
        const current = new Date(markingDate)
        const end = new Date(markingDateTo)
        while (current <= end) {
          dates.push(current.toISOString().split('T')[0])
          current.setDate(current.getDate() + 1)
        }
        const res = await window.electronAPI.attendance.bulkMark({
          employee_ids: [employee.id],
          dates,
          status_type_id: markingStatusId,
          notes: markingNotes || undefined,
          overwrite: true,
        })
        if (!res.success) {
          window.alert(res.error ?? t('common.error'))
          return
        }
      }
      setMarkingDate('')
      setMarkingDateTo('')
      setMarkingStatusId(null)
      setMarkingNotes('')
      await loadAttendance()
    } catch {
      window.alert(t('common.error'))
    }
  }

  const tabs = ['personal', 'employment', 'salary', 'vacation', 'attendance', 'documents'] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{employee.full_name}</h2>
            <span className="text-sm text-muted-foreground font-mono">{employee.employee_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[employee.employment_status] || ''}`}>
              {t(`employees.status_${employee.employment_status}`)}
            </span>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {tabs.map(tb => (
            <button key={tb} onClick={() => setTab(tb)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                tab === tb
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {tb === 'attendance' && <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden />}
              {t(`employees.tab_${tb}`)}
              {tb === 'documents' && documents.length > 0 && (
                <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{documents.length}</span>
              )}
              {tb === 'vacation' && vacations.length > 0 && (
                <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{vacations.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'personal' && <PersonalTab employee={employee} />}
          {tab === 'employment' && <EmploymentTab employee={employee} />}
          {tab === 'salary' && <SalaryViewTab salary={salaryCfg} employee={employee} t={t} />}
          {tab === 'vacation' && (
            <VacationTab
              employee={employee}
              vacations={vacations}
              onAdd={() => setShowVacForm(true)}
              onRefresh={() => { loadVacations(); onRefresh() }}
            />
          )}
          {tab === 'documents' && (
            <DocumentsTab
              documents={documents}
              onUpload={() => setShowDocUpload(true)}
              onRefresh={loadDocuments}
            />
          )}

          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (attendanceMonth === 1) {
                        setAttendanceMonth(12)
                        setAttendanceYear(y => y - 1)
                      } else {
                        setAttendanceMonth(m => m - 1)
                      }
                    }}
                    className="p-1 rounded hover:bg-accent"
                    aria-label={t('common.previous', { defaultValue: 'Previous' })}
                  >
                    ←
                  </button>
                  <span className="text-sm font-medium min-w-[120px] text-center text-foreground">
                    {new Date(attendanceYear, attendanceMonth - 1).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (attendanceMonth === 12) {
                        setAttendanceMonth(1)
                        setAttendanceYear(y => y + 1)
                      } else {
                        setAttendanceMonth(m => m + 1)
                      }
                    }}
                    className="p-1 rounded hover:bg-accent"
                    aria-label={t('common.next', { defaultValue: 'Next' })}
                  >
                    →
                  </button>
                </div>
              </div>

              {attendanceSummary && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">
                      {t('employees.attendanceRate', { defaultValue: 'Attendance rate' })}
                    </p>
                    <p className="text-xl font-bold text-primary">
                      {Math.round(attendanceSummary.attendance_rate * 100)}%
                    </p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">
                      {t('employees.presentDays', { defaultValue: 'Present days' })}
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {attendanceSummary.present_days}
                      <span className="text-sm text-muted-foreground">
                        /{attendanceSummary.total_working_days}
                      </span>
                    </p>
                  </div>
                  {attendanceSummary.by_status.map(s => (
                    <div
                      key={s.status_name}
                      className="p-2 rounded-lg text-center"
                      style={{ backgroundColor: `${s.status_color}20` }}
                    >
                      <p className="text-xs text-foreground">
                        {s.status_emoji} {s.status_name}
                      </p>
                      <p className="font-bold text-foreground">{s.count}</p>
                    </div>
                  ))}
                </div>
              )}

              {(user?.role === 'owner' || user?.role === 'manager') && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    {t('employees.markAttendance', { defaultValue: 'Mark attendance' })}
                  </p>
                  <div className="flex gap-1 p-0.5 bg-muted rounded-md w-fit mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMarkMode('single')
                        setMarkingDateTo('')
                      }}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        markMode === 'single'
                          ? 'bg-background shadow text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Single Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarkMode('range')}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        markMode === 'range'
                          ? 'bg-background shadow text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Date Range
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      {markMode === 'range' && (
                        <label className="text-xs text-muted-foreground mb-0.5 block">From</label>
                      )}
                      <input
                        type="date"
                        value={markingDate}
                        onChange={e => setMarkingDate(e.target.value)}
                        className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                      />
                    </div>
                    {markMode === 'range' ? (
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">To</label>
                        <input
                          type="date"
                          value={markingDateTo}
                          min={markingDate}
                          onChange={e => setMarkingDateTo(e.target.value)}
                          className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                        />
                      </div>
                    ) : (
                      <select
                        value={markingStatusId ?? ''}
                        onChange={e => setMarkingStatusId(Number(e.target.value) || null)}
                        className="border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                      >
                        <option value="">Status...</option>
                        {attendanceStatuses.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.emoji} {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {markMode === 'range' && (
                    <select
                      value={markingStatusId ?? ''}
                      onChange={e => setMarkingStatusId(Number(e.target.value) || null)}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      <option value="">Status...</option>
                      {attendanceStatuses.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.emoji} {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder={t('employees.attendanceNotesPlaceholder', { defaultValue: 'Notes (optional)' })}
                    value={markingNotes}
                    onChange={e => setMarkingNotes(e.target.value)}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => void handleMarkAttendance()}
                    disabled={
                      !markingDate ||
                      !markingStatusId ||
                      (markMode === 'range' && !markingDateTo)
                    }
                    className={`${btnPrimary} w-full py-1.5 text-sm`}
                  >
                    {t('common.save', { defaultValue: 'Save' })}
                  </button>
                </div>
              )}

              {attendanceLoading ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {t('common.loading', { defaultValue: 'Loading…' })}
                </p>
              ) : attendanceRecords.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {t('employees.attendanceEmptyMonth', { defaultValue: 'No attendance records for this month.' })}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {attendanceRecords.map(record => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded text-sm border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                          {new Date(record.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium truncate"
                          style={{
                            backgroundColor: `${record.status_color}20`,
                            color: record.status_color,
                          }}
                        >
                          {record.status_emoji} {record.status_name}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground text-right shrink-0 pl-2">
                        {record.marked_by_name ? <span>{record.marked_by_name}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showVacForm && (
        <VacationFormModal
          employeeId={employee.id}
          onClose={() => { setShowVacForm(false); loadVacations(); onRefresh() }}
        />
      )}

      {showDocUpload && (
        <DocumentUploadModal
          employeeId={employee.id}
          onClose={() => { setShowDocUpload(false); loadDocuments() }}
        />
      )}
    </div>
  )
}

/* ── Salary view tab ─────────────────────────────────────────────────────── */

function SalaryViewTab({
  salary,
  employee,
  t,
}: {
  salary: EmployeeSalaryConfig | null
  employee: Employee
  t: (key: string, opts?: { defaultValue?: string }) => string
}) {
  if (!salary) {
    return (
      <div className="text-sm text-muted-foreground space-y-2">
        <p>{t('employees.noSalaryConfig', { defaultValue: 'No salary configuration yet. Edit the employee and use the Salary tab to add payroll details.' })}</p>
        {employee.salary != null && (
          <p>
            {t('employees.legacySalaryHint', { defaultValue: 'Legacy amount on file' })}: د.إ {Number(employee.salary).toLocaleString()}
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.salaryType', { defaultValue: 'Salary type' })}</div>
        <div className="text-sm font-medium text-foreground">
          {t(`employees.salaryType_${salary.salary_type}`, { defaultValue: salary.salary_type })}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.salaryAmount', { defaultValue: 'Amount (د.إ)' })}</div>
        <div className="text-sm font-medium text-foreground">د.إ {salary.amount.toLocaleString()}</div>
      </div>
      {(salary.salary_type === 'monthly' || salary.salary_type === 'custom') && (
        <div>
          <div className="text-xs text-muted-foreground">{t('employees.paymentDayOfMonth', { defaultValue: 'Payment day (1–31)' })}</div>
          <div className="text-sm font-medium text-foreground">{salary.payment_day ?? '—'}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.salaryStartDate', { defaultValue: 'Salary start date' })}</div>
        <div className="text-sm font-medium text-foreground">{salary.start_date}</div>
      </div>
      {salary.custom_period && (
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground">{t('employees.customPeriod', { defaultValue: 'Custom period' })}</div>
          <div className="text-sm font-medium text-foreground">{salary.custom_period}</div>
        </div>
      )}
      {salary.notes && (
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground">{t('employees.salaryNotes', { defaultValue: 'Salary notes' })}</div>
          <div className="text-sm text-foreground whitespace-pre-wrap">{salary.notes}</div>
        </div>
      )}
    </div>
  )
}

/* ── Personal Tab ────────────────────────────────────────────────────────── */

function PersonalTab({ employee }: { employee: Employee }) {
  const { t } = useTranslation()
  const rows: [string, string | null][] = [
    [t('employees.fullName'), employee.full_name],
    [t('employees.nationality'), employee.nationality],
    [t('employees.nationalId'), employee.national_id],
    [t('employees.dateOfBirth'), employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : null],
    [t('employees.phone'), employee.phone],
    [t('employees.email'), employee.email],
    [t('employees.address'), employee.address],
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium text-foreground">{value || '—'}</div>
          </div>
        ))}
      </div>

      {employee.emergency_contact_name && (
        <>
          <h3 className="text-sm font-semibold text-foreground border-t border-border pt-4">{t('employees.emergencyContact')}</h3>
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            <div>
              <div className="text-xs text-muted-foreground">{t('employees.emergencyContactName')}</div>
              <div className="text-sm font-medium">{employee.emergency_contact_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('employees.emergencyContactPhone')}</div>
              <div className="text-sm font-medium">{employee.emergency_contact_phone || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('employees.emergencyContactRelation')}</div>
              <div className="text-sm font-medium">{employee.emergency_contact_relation || '—'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Employment Tab ──────────────────────────────────────────────────────── */

function EmploymentTab({ employee }: { employee: Employee }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.employeeId')}</div>
        <div className="text-sm font-mono font-medium">{employee.employee_id}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.role')}</div>
        <div className="text-sm font-medium">{employee.role}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.department')}</div>
        <div className="text-sm font-medium">{employee.department || '—'}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.hireDate')}</div>
        <div className="text-sm font-medium">{new Date(employee.hire_date).toLocaleDateString()}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t('employees.status')}</div>
        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[employee.employment_status] || ''}`}>
          {t(`employees.status_${employee.employment_status}`)}
        </span>
      </div>
      {employee.salary != null && (
        <>
          <div>
            <div className="text-xs text-muted-foreground">{t('employees.salary')}</div>
            <div className="text-sm font-medium">
              {employee.salary_currency || 'USD'} {Number(employee.salary).toLocaleString()}
              <span className="text-muted-foreground">/{t(`employees.${employee.payment_frequency || 'monthly'}`)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Vacation Tab ────────────────────────────────────────────────────────── */

function VacationTab({ employee, vacations, onAdd, onRefresh }:
  { employee: Employee; vacations: Vacation[]; onAdd: () => void; onRefresh: () => void }) {
  const { t } = useTranslation()

  async function endVacation(vac: Vacation) {
    const today = new Date().toISOString().split('T')[0]
    await window.electronAPI.employees.endVacation(vac.id, today)
    onRefresh()
  }

  async function deleteVacation(vac: Vacation) {
    if (!confirm(t('employees.confirmDeleteVacation'))) return
    await window.electronAPI.employees.deleteVacation(vac.id)
    onRefresh()
  }

  return (
    <div>
      {/* Current vacation banner */}
      {employee.is_on_vacation === 1 && employee.current_vacation_end && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
          <span className="font-medium text-yellow-700 dark:text-yellow-400">
            {t('employees.currentlyOnVacation')}
          </span>
          <span className="text-yellow-600 dark:text-yellow-500 ml-2">
            {t('employees.returns')}: {new Date(employee.current_vacation_end).toLocaleDateString()}
            {daysUntil(employee.current_vacation_end) > 0 && (
              <span className="ml-1">({daysUntil(employee.current_vacation_end)} {t('employees.daysRemaining')})</span>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{t('employees.vacationHistory')}</h3>
        <button onClick={onAdd} className={btnPrimary}>
          <span className="flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> {t('employees.addVacation')}</span>
        </button>
      </div>

      {vacations.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">{t('employees.noVacations')}</p>
      ) : (
        <div className="space-y-2">
          {vacations.map(vac => (
            <div key={vac.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 text-sm">
              <div className="flex items-center gap-4">
                <div>
                  <span className="font-medium capitalize">{vac.vacation_type}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    vac.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                    vac.status === 'approved' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}>{vac.status}</span>
                </div>
                <div className="text-muted-foreground">
                  {new Date(vac.start_date).toLocaleDateString()} — {new Date(vac.end_date).toLocaleDateString()}
                </div>
                {vac.reason && <span className="text-muted-foreground italic">"{vac.reason}"</span>}
              </div>
              <div className="flex items-center gap-1">
                {vac.status === 'approved' && (
                  <button onClick={() => endVacation(vac)} className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">
                    {t('employees.endVacation')}
                  </button>
                )}
                <button onClick={() => deleteVacation(vac)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Documents Tab ───────────────────────────────────────────────────────── */

function DocumentsTab({ documents, onUpload, onRefresh }:
  { documents: EmpDocument[]; onUpload: () => void; onRefresh: () => void }) {
  const { t } = useTranslation()

  async function openDoc(doc: EmpDocument) {
    await window.electronAPI.employees.openDocument(doc.id)
  }

  async function deleteDoc(doc: EmpDocument) {
    if (!confirm(t('employees.confirmDeleteDocument'))) return
    await window.electronAPI.employees.deleteDocument(doc.id)
    onRefresh()
  }

  function isExpiringSoon(expiryDate: string | null): 'expired' | 'soon' | 'ok' {
    if (!expiryDate) return 'ok'
    const days = daysUntil(expiryDate)
    if (days < 0) return 'expired'
    if (days <= 30) return 'soon'
    return 'ok'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{t('employees.documents')} ({documents.length})</h3>
        <button onClick={onUpload} className={btnPrimary}>
          <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> {t('employees.uploadDocument')}</span>
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground text-sm">{t('employees.noDocuments')}</p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => {
            const expStatus = isExpiringSoon(doc.expiry_date)
            return (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 text-sm">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="font-medium text-foreground">
                      {doc.document_name}
                      {expStatus === 'expired' && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                          {t('employees.expired')}
                        </span>
                      )}
                      {expStatus === 'soon' && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
                          {t('employees.expiringSoon')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span className="capitalize">{doc.document_type.replace('_', ' ')}</span>
                      {doc.document_number && <span>#{doc.document_number}</span>}
                      {doc.expiry_date && (
                        <span>{t('employees.expires')}: {new Date(doc.expiry_date).toLocaleDateString()}</span>
                      )}
                      <span>{formatFileSize(doc.file_size)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openDoc(doc)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title={t('common.open')}>
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteDoc(doc)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title={t('common.delete')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   VACATION FORM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

function VacationFormModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    vacation_type: 'annual',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    reason: '',
    status: 'approved',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.start_date || !form.end_date) return setError(t('employees.datesRequired'))
    if (form.end_date < form.start_date) return setError(t('employees.endAfterStart'))

    setSaving(true)
    setError('')
    try {
      await window.electronAPI.employees.addVacation({
        employee_id: employeeId,
        ...form,
      })
      onClose()
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={e => e.stopPropagation()}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('employees.addVacation')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

          <div>
            <label className={labelCls}>{t('employees.vacationType')}</label>
            <select className={inputCls} value={form.vacation_type} onChange={e => setForm(p => ({ ...p, vacation_type: e.target.value }))}>
              {VACATION_TYPES.map(v => <option key={v} value={v}>{t(`employees.vac_${v}`)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('employees.startDate')} *</label>
              <input type="date" className={inputCls} value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>{t('employees.endDate')} *</label>
              <input type="date" className={inputCls} value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('employees.reason')}</label>
            <textarea className={inputCls} rows={2} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className={btnOutline}>{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? t('common.saving') : t('employees.addVacation')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENT UPLOAD MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

function DocumentUploadModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    documentType: 'passport',
    documentName: '',
    issueDate: '',
    expiryDate: '',
    documentNumber: '',
    notes: '',
  })
  const [fileData, setFileData] = useState<{
    fileName: string; fileBuffer: number[]; mimeType: string; fileSize: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  async function chooseFile() {
    const res = await window.electronAPI.employees.chooseFile() as {
      success: boolean
      data?: { fileName: string; fileBuffer: number[]; mimeType: string; fileSize: number } | null
    }
    if (res.success && res.data) {
      setFileData(res.data)
      if (!form.documentName) {
        setForm(prev => ({ ...prev, documentName: res.data!.fileName }))
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const arr = new Uint8Array(reader.result as ArrayBuffer)
      setFileData({
        fileName: file.name,
        fileBuffer: Array.from(arr),
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
      })
      if (!form.documentName) setForm(prev => ({ ...prev, documentName: file.name }))
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleUpload() {
    if (!fileData) return setError(t('employees.fileRequired'))
    if (!form.documentType) return setError(t('employees.docTypeRequired'))

    setSaving(true)
    setError('')
    try {
      await window.electronAPI.employees.uploadDocument({
        employeeId,
        documentType: form.documentType,
        documentName: form.documentName || fileData.fileName,
        fileBuffer: fileData.fileBuffer,
        fileName: fileData.fileName,
        mimeType: fileData.mimeType,
        metadata: {
          issueDate: form.issueDate || null,
          expiryDate: form.expiryDate || null,
          documentNumber: form.documentNumber || null,
          notes: form.notes || null,
        },
      })
      onClose()
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={e => e.stopPropagation()}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('employees.uploadDocument')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

          <div>
            <label className={labelCls}>{t('employees.documentType')} *</label>
            <select className={inputCls} value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}>
              {DOC_TYPES.map(d => <option key={d} value={d}>{t(`employees.doc_${d}`)}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('employees.documentName')}</label>
            <input className={inputCls} value={form.documentName}
              onChange={e => setForm(p => ({ ...p, documentName: e.target.value }))}
              placeholder={t('employees.documentNamePlaceholder')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('employees.issueDate')}</label>
              <input type="date" className={inputCls} value={form.issueDate}
                onChange={e => setForm(p => ({ ...p, issueDate: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>{t('employees.expiryDate')}</label>
              <input type="date" className={inputCls} value={form.expiryDate}
                onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('employees.documentNumber')}</label>
            <input className={inputCls} value={form.documentNumber}
              onChange={e => setForm(p => ({ ...p, documentNumber: e.target.value }))} />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={chooseFile}
          >
            {fileData ? (
              <div>
                <FileText className="w-8 h-8 mx-auto text-primary mb-2" />
                <p className="text-sm font-medium text-foreground">{fileData.fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatFileSize(fileData.fileSize)}</p>
                <p className="text-xs text-primary mt-2">{t('employees.clickToChange')}</p>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t('employees.dropOrClick')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('employees.supportedFormats')}</p>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>{t('employees.notes')}</label>
            <textarea className={inputCls} rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className={btnOutline}>{t('common.cancel')}</button>
          <button onClick={handleUpload} disabled={saving || !fileData} className={btnPrimary}>
            {saving ? t('common.saving') : t('employees.upload')}
          </button>
        </div>
      </div>
    </div>
  )
}
