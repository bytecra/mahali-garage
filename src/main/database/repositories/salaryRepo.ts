import { getDb } from '../index'
import { expenseRepo } from './expenseRepo'
import { notificationRepo } from './notificationRepo'

export type SalaryType = 'monthly' | 'weekly' | 'daily' | 'one_time' | 'custom'
export type PayrollMonthStatus = 'paid' | 'unpaid' | 'overdue'

export interface EmployeeSalaryRow {
  id: number
  employee_id: number
  salary_type: SalaryType
  amount: number
  payment_day: number | null
  start_date: string
  notes: string | null
  custom_period: string | null
  created_at: string
}

export interface PayrollListRow {
  employee_id: number
  full_name: string
  employee_code: string
  salary_type: SalaryType
  amount: number
  payment_day: number | null
  month_status: PayrollMonthStatus
  carryover_amount: number
  current_period_amount: number
  total_due: number
  period_label: string
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function lastOfMonthFrom(y: number, m0: number): Date {
  return new Date(y, m0 + 1, 0)
}

function dueDateForMonthPeriod(periodStartYmd: string, paymentDay: number): string {
  const d0 = parseYmd(periodStartYmd)
  const y = d0.getFullYear()
  const m = d0.getMonth()
  const last = lastOfMonthFrom(y, m).getDate()
  const day = Math.min(Math.max(1, paymentDay || 1), last)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const x = new Date(d)
  x.setDate(d.getDate() + diff)
  return x
}

function endOfWeekSunday(d: Date): Date {
  const mon = startOfWeekMonday(d)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return sun
}

function mapSalaryTypeToPaymentFrequency(t: SalaryType): string {
  if (t === 'weekly') return 'weekly'
  if (t === 'daily') return 'weekly'
  return 'monthly'
}

function getSalariesCategoryId(): number | null {
  const row = getDb().prepare(
    `SELECT id FROM expense_categories WHERE name IN ('Salaries', 'Salary') ORDER BY id LIMIT 1`
  ).get() as { id: number } | undefined
  return row?.id ?? null
}

function isPeriodPaid(employeeId: number, periodStart: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 as x FROM salary_payments
    WHERE employee_id = ? AND period_start = ? AND status = 'paid' LIMIT 1
  `).get(employeeId, periodStart) as { x: number } | undefined
  return !!row
}

function periodStatusUnpaid(
  periodEndYmd: string,
  periodStartYmd: string,
  paymentDay: number,
  today: Date,
): 'unpaid' | 'overdue' {
  const tStr = ymd(today)
  if (periodEndYmd < tStr) return 'overdue'
  const due = dueDateForMonthPeriod(periodStartYmd, paymentDay)
  return tStr > due ? 'overdue' : 'unpaid'
}

function upsertUnpaidPayment(
  employeeId: number,
  amount: number,
  periodStart: string,
  periodEnd: string,
  st: 'unpaid' | 'overdue',
): void {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO salary_payments (employee_id, amount, period_start, period_end, status, paid_date, notes)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `).run(employeeId, amount, periodStart, periodEnd, st)
  db.prepare(`
    UPDATE salary_payments SET amount = ?, period_end = ?, status = ?
    WHERE employee_id = ? AND period_start = ? AND status IN ('unpaid','overdue')
  `).run(amount, periodEnd, st, employeeId, periodStart)
}

function syncMonthlyLike(
  employeeId: number,
  amount: number,
  startDateStr: string,
  paymentDay: number,
  today: Date,
): void {
  const start = parseYmd(startDateStr)
  const curMonthStart = firstOfMonth(today)
  let iter = firstOfMonth(start)
  while (iter <= curMonthStart) {
    const ps = ymd(iter)
    const pe = ymd(lastOfMonthFrom(iter.getFullYear(), iter.getMonth()))
    if (isPeriodPaid(employeeId, ps)) {
      iter.setMonth(iter.getMonth() + 1)
      continue
    }
    const st = periodStatusUnpaid(pe, ps, paymentDay, today)
    upsertUnpaidPayment(employeeId, amount, ps, pe, st)
    iter.setMonth(iter.getMonth() + 1)
  }
}

function syncWeekly(employeeId: number, amount: number, startDateStr: string, today: Date): void {
  const start = parseYmd(startDateStr)
  let weekStart = startOfWeekMonday(start)
  const endWeek = startOfWeekMonday(today)
  while (weekStart <= endWeek) {
    const ps = ymd(weekStart)
    const pe = ymd(endOfWeekSunday(weekStart))
    if (isPeriodPaid(employeeId, ps)) {
      weekStart = new Date(weekStart)
      weekStart.setDate(weekStart.getDate() + 7)
      continue
    }
    const st = pe < ymd(today) ? 'overdue' : 'unpaid'
    upsertUnpaidPayment(employeeId, amount, ps, pe, st)
    weekStart = new Date(weekStart)
    weekStart.setDate(weekStart.getDate() + 7)
  }
}

function syncDaily(employeeId: number, amount: number, startDateStr: string, today: Date): void {
  const start = parseYmd(startDateStr)
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(start)
  while (d <= end) {
    const ps = ymd(d)
    if (isPeriodPaid(employeeId, ps)) {
      d.setDate(d.getDate() + 1)
      continue
    }
    const st = ps < ymd(today) ? 'overdue' : 'unpaid'
    upsertUnpaidPayment(employeeId, amount, ps, ps, st)
    d.setDate(d.getDate() + 1)
  }
}

function syncOneTime(employeeId: number, amount: number, startDateStr: string, today: Date): void {
  const ps = startDateStr
  const pe = startDateStr
  if (isPeriodPaid(employeeId, ps)) return
  const st = pe < ymd(today) ? 'overdue' : 'unpaid'
  upsertUnpaidPayment(employeeId, amount, ps, pe, st)
}

function syncForEmployee(
  employeeId: number,
  cfg: EmployeeSalaryRow,
  today: Date,
): void {
  const pd = cfg.payment_day ?? 1
  switch (cfg.salary_type) {
    case 'monthly':
      syncMonthlyLike(employeeId, cfg.amount, cfg.start_date, pd, today)
      break
    case 'custom':
      syncMonthlyLike(employeeId, cfg.amount, cfg.start_date, pd, today)
      break
    case 'weekly':
      syncWeekly(employeeId, cfg.amount, cfg.start_date, today)
      break
    case 'daily':
      syncDaily(employeeId, cfg.amount, cfg.start_date, today)
      break
    case 'one_time':
      syncOneTime(employeeId, cfg.amount, cfg.start_date, today)
      break
    default:
      break
  }
}

function currentPeriodBounds(
  salaryType: SalaryType,
  startDateStr: string,
  today: Date,
): { start: string; end: string; label: string } {
  if (salaryType === 'weekly') {
    const mon = startOfWeekMonday(today)
    const ps = ymd(mon)
    const pe = ymd(endOfWeekSunday(today))
    return { start: ps, end: pe, label: `${ps} – ${pe}` }
  }
  if (salaryType === 'daily') {
    const ps = ymd(today)
    return { start: ps, end: ps, label: ps }
  }
  if (salaryType === 'one_time') {
    return { start: startDateStr, end: startDateStr, label: startDateStr }
  }
  const fo = firstOfMonth(today)
  const ps = ymd(fo)
  const pe = ymd(lastOfMonthFrom(fo.getFullYear(), fo.getMonth()))
  return { start: ps, end: pe, label: `${ps.slice(0, 7)}` }
}

function computeMonthStatus(
  employeeId: number,
  cfg: EmployeeSalaryRow,
  today: Date,
): { month_status: PayrollMonthStatus; carryover: number; current: number; total: number; period_label: string } {
  const bounds = currentPeriodBounds(cfg.salary_type, cfg.start_date, today)
  const paidCurrent = isPeriodPaid(employeeId, bounds.start)
  const db = getDb()

  const cr = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as s FROM salary_payments
    WHERE employee_id = ? AND status IN ('unpaid','overdue')
      AND period_start < ?
  `).get(employeeId, bounds.start) as { s: number }
  const carryover = cr.s

  let current = 0
  if (!paidCurrent) {
    const row = db.prepare(`
      SELECT amount FROM salary_payments
      WHERE employee_id = ? AND period_start = ? AND status IN ('unpaid','overdue')
    `).get(employeeId, bounds.start) as { amount: number } | undefined
    current = row?.amount ?? cfg.amount
  }

  let month_status: PayrollMonthStatus = 'paid'
  if (carryover > 0) {
    month_status = 'overdue'
  } else if (!paidCurrent) {
    const row = db.prepare(`
      SELECT status FROM salary_payments
      WHERE employee_id = ? AND period_start = ? AND status IN ('unpaid','overdue')
    `).get(employeeId, bounds.start) as { status: string } | undefined
    if (row?.status === 'overdue') month_status = 'overdue'
    else month_status = 'unpaid'
  }

  const total = carryover + (paidCurrent ? 0 : current)
  return { month_status, carryover, current, total, period_label: bounds.label }
}

export const salaryRepo = {
  getByEmployeeId(employeeId: number): EmployeeSalaryRow | null {
    return getDb().prepare('SELECT * FROM employee_salaries WHERE employee_id = ?').get(employeeId) as EmployeeSalaryRow | null
  },

  upsert(input: {
    employee_id: number
    salary_type: SalaryType
    amount: number
    payment_day?: number | null
    start_date: string
    notes?: string | null
    custom_period?: string | null
  }): EmployeeSalaryRow {
    const db = getDb()
    db.prepare(`
      INSERT INTO employee_salaries (employee_id, salary_type, amount, payment_day, start_date, notes, custom_period)
      VALUES (@employee_id, @salary_type, @amount, @payment_day, @start_date, @notes, @custom_period)
      ON CONFLICT(employee_id) DO UPDATE SET
        salary_type = excluded.salary_type,
        amount = excluded.amount,
        payment_day = excluded.payment_day,
        start_date = excluded.start_date,
        notes = excluded.notes,
        custom_period = excluded.custom_period
    `).run({
      employee_id: input.employee_id,
      salary_type: input.salary_type,
      amount: input.amount,
      payment_day: input.payment_day ?? null,
      start_date: input.start_date,
      notes: input.notes ?? null,
      custom_period: input.custom_period ?? null,
    })
    db.prepare(`
      UPDATE employees SET salary = ?, salary_currency = 'AED', payment_frequency = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.amount, mapSalaryTypeToPaymentFrequency(input.salary_type), input.employee_id)
    return salaryRepo.getByEmployeeId(input.employee_id) as EmployeeSalaryRow
  },

  syncAllActive(): void {
    const db = getDb()
    const today = new Date()
    const rows = db.prepare(`
      SELECT es.* FROM employee_salaries es
      INNER JOIN employees e ON e.id = es.employee_id
      WHERE e.employment_status = 'active'
    `).all() as EmployeeSalaryRow[]
    for (const cfg of rows) {
      syncForEmployee(cfg.employee_id, cfg, today)
    }
  },

  listPayroll(filter: 'all' | 'paid' | 'unpaid' | 'overdue'): PayrollListRow[] {
    salaryRepo.syncAllActive()
    const db = getDb()
    const today = new Date()
    const employees = db.prepare(`
      SELECT e.id, e.full_name, e.employee_id, es.*
      FROM employees e
      INNER JOIN employee_salaries es ON es.employee_id = e.id
      WHERE e.employment_status = 'active'
      ORDER BY e.full_name ASC
    `).all() as Array<{
      id: number
      full_name: string
      employee_id: string
    } & EmployeeSalaryRow>

    const out: PayrollListRow[] = []
    for (const row of employees) {
      const cfg = row as unknown as EmployeeSalaryRow
      const meta = computeMonthStatus(row.id, cfg, today)
      const pr: PayrollListRow = {
        employee_id: row.id,
        full_name: row.full_name,
        employee_code: row.employee_id,
        salary_type: cfg.salary_type,
        amount: cfg.amount,
        payment_day: cfg.payment_day,
        month_status: meta.month_status,
        carryover_amount: meta.carryover,
        current_period_amount: meta.current,
        total_due: meta.total,
        period_label: meta.period_label,
      }
      if (filter === 'all') out.push(pr)
      else if (filter === 'paid' && pr.month_status === 'paid') out.push(pr)
      else if (filter === 'unpaid' && pr.month_status === 'unpaid') out.push(pr)
      else if (filter === 'overdue' && pr.month_status === 'overdue') out.push(pr)
    }
    return out
  },

  markPaid(employeeId: number): { expense_id: number; amount: number } {
    const db = getDb()
    const cfg = salaryRepo.getByEmployeeId(employeeId)
    if (!cfg) throw new Error('No salary configuration')

    salaryRepo.syncAllActive()
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as s FROM salary_payments
      WHERE employee_id = ? AND status IN ('unpaid','overdue')
    `).get(employeeId) as { s: number }
    const total = row.s
    if (total <= 0) throw new Error('Nothing to pay')

    const emp = db.prepare('SELECT full_name FROM employees WHERE id = ?').get(employeeId) as { full_name: string } | undefined
    const name = emp?.full_name ?? 'Employee'
    const today = new Date()
    const bounds = currentPeriodBounds(cfg.salary_type, cfg.start_date, today)

    const catId = getSalariesCategoryId()
    const expenseId = expenseRepo.create({
      name: `Salary — ${name} (${bounds.label})`,
      category_id: catId,
      amount: total,
      date: ymd(today),
      is_paid: 1,
      notes: 'Payroll',
    })

    db.prepare(`
      DELETE FROM salary_payments WHERE employee_id = ? AND status IN ('unpaid','overdue')
    `).run(employeeId)

    db.prepare(`
      DELETE FROM salary_payments
      WHERE employee_id = ? AND period_start = ? AND status = 'paid'
    `).run(employeeId, bounds.start)

    db.prepare(`
      INSERT INTO salary_payments (employee_id, amount, period_start, period_end, paid_date, status, notes, expense_id)
      VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)
    `).run(
      employeeId,
      total,
      bounds.start,
      bounds.end,
      ymd(today),
      'Payroll (includes any carryover)',
      expenseId,
    )

    return { expense_id: expenseId, amount: total }
  },

  totalUnpaidDue(): number {
    try {
      const rows = salaryRepo.listPayroll('all')
      return rows.reduce((s, r) => s + (r.month_status === 'paid' ? 0 : r.total_due), 0)
    } catch {
      return 0
    }
  },

  getPayrollSettings(): { reminders_enabled: boolean; reminder_days_before: number } {
    const db = getDb()
    const en = (db.prepare(`SELECT value FROM settings WHERE key = 'payroll.reminders_enabled'`).get() as { value: string } | undefined)?.value ?? '1'
    const days = (db.prepare(`SELECT value FROM settings WHERE key = 'payroll.reminder_days_before'`).get() as { value: string } | undefined)?.value ?? '2'
    return {
      reminders_enabled: en === '1' || en === 'true',
      reminder_days_before: Math.max(0, parseInt(days, 10) || 2),
    }
  },

  runDailyPayrollTasks(): void {
    salaryRepo.syncAllActive()
    const settings = salaryRepo.getPayrollSettings()
    if (settings.reminders_enabled) {
      salaryRepo.notifyDueSoon(settings.reminder_days_before)
    }
  },

  notifyDueSoon(daysBefore: number): void {
    const db = getDb()
    const today = new Date()
    const tStr = ymd(today)
    const owners = db.prepare(`SELECT id FROM users WHERE role = 'owner' AND is_active = 1`).all() as { id: number }[]
    if (owners.length === 0) return

    const dueSoon: string[] = []
    const rows = db.prepare(`
      SELECT e.id, e.full_name, es.salary_type, es.amount, es.payment_day, es.start_date
      FROM employees e
      INNER JOIN employee_salaries es ON es.employee_id = e.id
      WHERE e.employment_status = 'active'
    `).all() as Array<{
      id: number
      full_name: string
      salary_type: SalaryType
      amount: number
      payment_day: number | null
      start_date: string
    }>

    for (const r of rows) {
      const cfg = salaryRepo.getByEmployeeId(r.id)
      if (!cfg) continue
      const meta = computeMonthStatus(r.id, cfg, today)
      if (meta.month_status === 'paid' || meta.total_due <= 0) continue

      let dueStr: string | null = null
      if (cfg.salary_type === 'monthly' || cfg.salary_type === 'custom') {
        const fo = firstOfMonth(today)
        const ps = ymd(fo)
        dueStr = dueDateForMonthPeriod(ps, cfg.payment_day ?? 1)
      } else if (cfg.salary_type === 'weekly') {
        const pe = ymd(endOfWeekSunday(today))
        dueStr = pe
      } else if (cfg.salary_type === 'daily') {
        dueStr = tStr
      } else {
        dueStr = cfg.start_date
      }
      if (!dueStr) continue
      const due = parseYmd(dueStr).getTime()
      const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      const diffDays = Math.ceil((due - today0) / 86_400_000)
      if (diffDays >= 0 && diffDays <= daysBefore) {
        dueSoon.push(r.full_name)
      }
    }

    if (dueSoon.length === 0) return

    const already = db.prepare(`
      SELECT COUNT(*) as c FROM notifications
      WHERE type = 'due_soon' AND title = 'Payroll reminder'
        AND date(created_at) = date('now')
    `).get() as { c: number }
    if ((already.c ?? 0) > 0) return

    const msg = dueSoon.length === 1
      ? `Salary due soon for: ${dueSoon[0]}`
      : `${dueSoon.length} salaries due within ${daysBefore} day(s): ${dueSoon.slice(0, 5).join(', ')}${dueSoon.length > 5 ? '…' : ''}`

    for (const o of owners) {
      notificationRepo.create({
        userId: o.id,
        taskId: null,
        type: 'due_soon',
        title: 'Payroll reminder',
        message: msg,
      })
    }
  },
}
