/**
 * Shared IPC parameter types — single source of truth for all IPC channel inputs.
 * Import with `import type` in preload.ts and electron.d.ts to eliminate `unknown`.
 *
 * Naming convention:
 *   - Interfaces with precise shapes (validated by handlers).
 *   - `Record<string, unknown>` aliases for domains whose repo shapes are complex
 *     but whose contracts are enforced by the handler layer.
 */

// ── Auth ──────────────────────────────────────────────────────────────────

export interface LoginCredentials {
  username: string
  password: string
}

export interface ChangePasswordParams {
  newPassword: string
  currentPassword?: string
}

export interface ResolveResetRequestParams {
  requestId: number
  action: 'accept' | 'reject'
}

/** Used with auth:resetPassword (developer/manager reset-code flow). */
export interface DevResetPasswordParams {
  code: string
  username: string
  newPassword: string
}

// ── Users ─────────────────────────────────────────────────────────────────

export interface UserListFilters {
  role?: string
}

export interface UserCreateInput {
  username: string
  password: string
  full_name: string
  role: string
  work_department?: string | null
}

export interface UserUpdateInput {
  full_name?: string
  role?: string
  is_active?: boolean
  work_department?: string | null
  new_password?: string
}

export interface UserSetAuthInput {
  auth_type: 'password' | 'passcode_4' | 'passcode_6'
  passcode?: string | null
}

export interface UserPreferencesPatch {
  theme?: 'light' | 'dark' | 'system'
  language?: 'en' | 'ar'
  jobCardsView?: 'kanban' | 'list'
}

// ── Products ──────────────────────────────────────────────────────────────

export type ProductListFilters = Record<string, unknown>
export type ProductCreateInput = Record<string, unknown>
export type ProductUpdateInput = Record<string, unknown>

export interface StockAdjustmentInput {
  type: 'add' | 'remove' | 'set'
  quantity: number
  reason?: string | null
}

// ── Categories / Brands ───────────────────────────────────────────────────

export type CategoryCreateInput = Record<string, unknown>
export type CategoryUpdateInput = Record<string, unknown>
export type BrandCreateInput = Record<string, unknown>
export type BrandUpdateInput = Record<string, unknown>

// ── Suppliers ─────────────────────────────────────────────────────────────

export type SupplierListFilters = Record<string, unknown>
export type SupplierCreateInput = Record<string, unknown>
export type SupplierUpdateInput = Record<string, unknown>

// ── Partners ──────────────────────────────────────────────────────────────

export type PartnerListFilters = Record<string, unknown>
export type PartnerCreateInput = Record<string, unknown>
export type PartnerUpdateInput = Record<string, unknown>

// ── Customers ─────────────────────────────────────────────────────────────

export type CustomerListFilters = Record<string, unknown>
export type CustomerCreateInput = Record<string, unknown>
export type CustomerUpdateInput = Record<string, unknown>

// ── Appointments ──────────────────────────────────────────────────────────

export type AppointmentCreateInput = Record<string, unknown>

// ── Sales ─────────────────────────────────────────────────────────────────

export type SaleListFilters = Record<string, unknown>
export type SaleCreateInput = Record<string, unknown>
export type SaleDraftInput = Record<string, unknown>
export type SalePaymentInput = Record<string, unknown>

// ── Repairs ───────────────────────────────────────────────────────────────

export type RepairListFilters = Record<string, unknown>
export type RepairCreateInput = Record<string, unknown>
export type RepairUpdateInput = Record<string, unknown>

// ── Assets ────────────────────────────────────────────────────────────────

export type AssetListFilters = Record<string, unknown>
export type AssetCreateInput = Record<string, unknown>
export type AssetUpdateInput = Record<string, unknown>

// ── Reports ───────────────────────────────────────────────────────────────

export type SalaryReportParams = Record<string, unknown>
export type CsvExportParams = Record<string, unknown>

export interface EmployeePerformanceParams {
  employeeId?: number
  fromDate: string
  toDate: string
  department?: string
}

// ── Activity ──────────────────────────────────────────────────────────────

export type ActivityListFilters = Record<string, unknown>

// ── Expenses ──────────────────────────────────────────────────────────────

export type ExpenseCategoryCreateInput = Record<string, unknown>
export type ExpenseCategoryUpdateInput = Record<string, unknown>
export type ExpenseListFilters = Record<string, unknown>
export type ExpenseCreateInput = Record<string, unknown>
export type ExpenseUpdateInput = Record<string, unknown>

// ── Vehicles ──────────────────────────────────────────────────────────────

export type VehicleListFilters = Record<string, unknown>
export type VehicleCreateInput = Record<string, unknown>
export type VehicleUpdateInput = Record<string, unknown>

// ── Job Cards ─────────────────────────────────────────────────────────────

export type JobCardListFilters = Record<string, unknown>
export interface JobCardByStatusFilters { profile?: 'all' | 'complete' | 'incomplete' }
export type JobCardCreateInput = Record<string, unknown>
export type JobCardUpdateInput = Record<string, unknown>
export type JobCardPartInput = Record<string, unknown>
export type JobCardAttachmentPayload = Record<string, unknown>
export type JobCardAttachmentPatch = Record<string, unknown>
export type JobInvoicePayload = Record<string, unknown>
export type WarrantyTemplateInput = Record<string, unknown>
export type WarrantyRowsInput = Record<string, unknown>

// ── Car Brands ────────────────────────────────────────────────────────────

export type CarBrandCreateInput = Record<string, unknown>
export type CarBrandUpdateInput = Record<string, unknown>

// ── Service Catalog ───────────────────────────────────────────────────────

export type ServiceCatalogListFilters = Record<string, unknown>
export type ServiceCatalogCreateInput = Record<string, unknown>
export type ServiceCatalogUpdateInput = Record<string, unknown>

// ── Services ──────────────────────────────────────────────────────────────

export type ServiceListFilters = Record<string, unknown>
export type ServiceCreateInput = Record<string, unknown>
export type ServiceUpdateInput = Record<string, unknown>

// ── Custom Receipts ───────────────────────────────────────────────────────

export type CustomReceiptListFilters = Record<string, unknown>
export type CustomReceiptCreateInput = Record<string, unknown>

// ── Backup ────────────────────────────────────────────────────────────────

export type BackupSettingsUpdateInput = Record<string, unknown>

// ── Employees ─────────────────────────────────────────────────────────────

export type EmployeeListFilters = Record<string, unknown>
export type EmployeeCreateInput = Record<string, unknown>
export type EmployeeUpdateInput = Record<string, unknown>
export type VacationCreateInput = Record<string, unknown>
export type EmployeeDocumentUploadInput = Record<string, unknown>
export type SalaryUpsertInput = Record<string, unknown>

// ── Store Documents ───────────────────────────────────────────────────────

export interface StoreDocumentUploadInput {
  name: string
  doc_type: string
  file_name: string
  file_data: string
  has_expiry: number
  expiry_date?: string
  notes?: string
}

// ── Attendance ────────────────────────────────────────────────────────────

export interface AttendanceCreateStatusInput {
  name: string
  color: string
  emoji?: string
  is_paid: number
  counts_as_working: number
}

export type AttendanceUpdateStatusInput = Partial<AttendanceCreateStatusInput>

export interface AttendanceMarkInput {
  employee_id: number
  date: string
  status_type_id: number
  department?: string
  notes?: string
}

export interface AttendanceBulkMarkInput {
  employee_ids: number[]
  dates: string[]
  status_type_id: number
  department?: string
  notes?: string
  overwrite?: boolean
}

// ── Loyalty ───────────────────────────────────────────────────────────────

export interface LoyaltyTransactionInput {
  customer_id: number
  department?: 'all' | 'tech'
  type: 'earn_points' | 'earn_stamps' | 'redeem' | 'manual_adjust'
  points_delta: number
  stamps_delta: number
  visits_delta: number
  source?: 'invoice' | 'receipt' | 'manual'
  source_id?: number
  note?: string
  created_by?: number
}

export interface LoyaltyAutoEarnParams {
  customer_id: number
  amount: number
  source: 'invoice' | 'receipt'
  source_id: number
  created_by: number
  department?: 'tech'
}

export interface LoyaltyRedeemParams {
  customer_id: number
  department: 'all' | 'tech'
  note: string
  created_by: number
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export type TaskListFilters = Record<string, unknown>
export type TaskCreateInput = Record<string, unknown>
export type TaskUpdateInput = Record<string, unknown>
export type TaskDeliveryInput = Record<string, unknown>
