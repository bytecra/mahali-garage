import { getDb } from '../index'

/* ── Interfaces ──────────────────────────────────────────────────────────── */

export interface CreateEmployeeInput {
  full_name: string
  nationality?: string
  national_id?: string
  date_of_birth?: string
  phone?: string
  email?: string
  address?: string
  role: string
  department?: string
  hire_date: string
  salary?: number
  salary_currency?: string
  payment_frequency?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  notes?: string
  created_by?: number
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  employment_status?: string
}

export interface EmployeeFilters {
  search?: string
  status?: string
}

export interface VacationInput {
  employee_id: number
  vacation_type?: string
  start_date: string
  end_date: string
  reason?: string
  approved_by?: number
  status?: string
}

export interface DocumentInput {
  employee_id: number
  document_type: string
  document_name: string
  file_path: string
  file_size?: number
  mime_type?: string
  issue_date?: string
  expiry_date?: string
  document_number?: string
  notes?: string
  uploaded_by?: number
}

/* ── Repository ──────────────────────────────────────────────────────────── */

export const employeeRepo = {
  /* ── Auto-generated employee ID ────────────────────────────────────────── */
  nextEmployeeId(): string {
    const db = getDb()
    const raw = (
      db.prepare(`SELECT value FROM settings WHERE key = 'employee.next_number'`).get() as
        { value: string } | undefined
    )?.value ?? '1'
    const next = parseInt(raw, 10)
    const empId = `EMP-${String(next).padStart(3, '0')}`
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'employee.next_number'`).run(String(next + 1))
    return empId
  },

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  list(filters: EmployeeFilters = {}) {
    const db = getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.status) {
      conditions.push('e.employment_status = ?')
      params.push(filters.status)
    }
    if (filters.search) {
      conditions.push('(e.full_name LIKE ? OR e.employee_id LIKE ? OR e.phone LIKE ?)')
      const like = `%${filters.search}%`
      params.push(like, like, like)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM employee_documents WHERE employee_id = e.id) as document_count,
        (SELECT COUNT(*) FROM employee_vacations WHERE employee_id = e.id) as vacation_count
      FROM employees e
      ${where}
      ORDER BY e.employee_id ASC
    `).all(...params)
  },

  getById(id: number) {
    return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(id)
  },

  create(input: CreateEmployeeInput) {
    const db = getDb()
    const empId = this.nextEmployeeId()

    const result = db.prepare(`
      INSERT INTO employees (
        employee_id, full_name, nationality, national_id, date_of_birth,
        phone, email, address, role, department, hire_date,
        salary, salary_currency, payment_frequency,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empId,
      input.full_name,
      input.nationality ?? null,
      input.national_id ?? null,
      input.date_of_birth ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.role,
      input.department ?? null,
      input.hire_date,
      input.salary ?? null,
      input.salary_currency ?? 'USD',
      input.payment_frequency ?? 'monthly',
      input.emergency_contact_name ?? null,
      input.emergency_contact_phone ?? null,
      input.emergency_contact_relation ?? null,
      input.notes ?? null,
      input.created_by ?? null,
    )

    return db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid as number)
  },

  update(id: number, input: UpdateEmployeeInput) {
    const db = getDb()
    const fields: string[] = []
    const params: unknown[] = []

    const map: Record<string, string> = {
      full_name: 'full_name', nationality: 'nationality', national_id: 'national_id',
      date_of_birth: 'date_of_birth', phone: 'phone', email: 'email', address: 'address',
      role: 'role', department: 'department', hire_date: 'hire_date',
      salary: 'salary', salary_currency: 'salary_currency', payment_frequency: 'payment_frequency',
      emergency_contact_name: 'emergency_contact_name',
      emergency_contact_phone: 'emergency_contact_phone',
      emergency_contact_relation: 'emergency_contact_relation',
      employment_status: 'employment_status', notes: 'notes',
    }

    for (const [key, col] of Object.entries(map)) {
      if (key in input) {
        fields.push(`${col} = ?`)
        params.push((input as Record<string, unknown>)[key] ?? null)
      }
    }

    if (fields.length === 0) return this.getById(id)

    fields.push("updated_at = datetime('now')")
    params.push(id)

    db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return this.getById(id)
  },

  delete(id: number) {
    getDb().prepare('DELETE FROM employees WHERE id = ?').run(id)
    return true
  },

  /* ── Vacations ──────────────────────────────────────────────────────────── */

  listVacations(employeeId: number) {
    return getDb().prepare(`
      SELECT v.*, u.full_name as approved_by_name
      FROM employee_vacations v
      LEFT JOIN users u ON v.approved_by = u.id
      WHERE v.employee_id = ?
      ORDER BY v.start_date DESC
    `).all(employeeId)
  },

  addVacation(input: VacationInput) {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO employee_vacations
        (employee_id, vacation_type, start_date, end_date, reason, approved_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.employee_id,
      input.vacation_type ?? 'annual',
      input.start_date,
      input.end_date,
      input.reason ?? null,
      input.approved_by ?? null,
      input.status ?? 'approved',
    )

    db.prepare(`
      UPDATE employees SET
        is_on_vacation = 1,
        current_vacation_start = ?,
        current_vacation_end = ?,
        employment_status = 'on_leave',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(input.start_date, input.end_date, input.employee_id)

    return { id: result.lastInsertRowid as number }
  },

  endVacation(vacationId: number, actualReturnDate: string) {
    const db = getDb()
    const vacation = db.prepare('SELECT employee_id FROM employee_vacations WHERE id = ?').get(vacationId) as
      { employee_id: number } | undefined
    if (!vacation) return false

    db.prepare(`
      UPDATE employee_vacations SET actual_return_date = ?, status = 'completed' WHERE id = ?
    `).run(actualReturnDate, vacationId)

    db.prepare(`
      UPDATE employees SET
        is_on_vacation = 0,
        current_vacation_start = NULL,
        current_vacation_end = NULL,
        employment_status = 'active',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(vacation.employee_id)

    return true
  },

  deleteVacation(vacationId: number) {
    getDb().prepare('DELETE FROM employee_vacations WHERE id = ?').run(vacationId)
    return true
  },

  /* ── Documents ──────────────────────────────────────────────────────────── */

  listDocuments(employeeId: number) {
    return getDb().prepare(`
      SELECT d.*, u.full_name as uploaded_by_name
      FROM employee_documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.employee_id = ?
      ORDER BY d.uploaded_at DESC
    `).all(employeeId)
  },

  addDocument(input: DocumentInput) {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO employee_documents
        (employee_id, document_type, document_name, file_path, file_size, mime_type,
         issue_date, expiry_date, document_number, notes, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.employee_id,
      input.document_type,
      input.document_name,
      input.file_path,
      input.file_size ?? null,
      input.mime_type ?? null,
      input.issue_date ?? null,
      input.expiry_date ?? null,
      input.document_number ?? null,
      input.notes ?? null,
      input.uploaded_by ?? null,
    )
    return { id: result.lastInsertRowid as number }
  },

  getDocument(docId: number) {
    return getDb().prepare('SELECT * FROM employee_documents WHERE id = ?').get(docId)
  },

  deleteDocument(docId: number) {
    getDb().prepare('DELETE FROM employee_documents WHERE id = ?').run(docId)
    return true
  },
}
