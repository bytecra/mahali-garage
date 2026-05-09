import { contextBridge, ipcRenderer } from 'electron'
import type {
  LoginCredentials,
  ChangePasswordParams,
  ResolveResetRequestParams,
  DevResetPasswordParams,
  UserListFilters,
  UserCreateInput,
  UserUpdateInput,
  UserSetAuthInput,
  UserPreferencesPatch,
  ProductListFilters,
  ProductCreateInput,
  ProductUpdateInput,
  StockAdjustmentInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  BrandCreateInput,
  BrandUpdateInput,
  SupplierListFilters,
  SupplierCreateInput,
  SupplierUpdateInput,
  PartnerListFilters,
  PartnerCreateInput,
  PartnerUpdateInput,
  CustomerListFilters,
  CustomerCreateInput,
  CustomerUpdateInput,
  AppointmentCreateInput,
  SaleListFilters,
  SaleCreateInput,
  SaleDraftInput,
  SalePaymentInput,
  RepairListFilters,
  RepairCreateInput,
  RepairUpdateInput,
  AssetListFilters,
  AssetCreateInput,
  AssetUpdateInput,
  SalaryReportParams,
  EmployeePerformanceParams,
  CsvExportParams,
  ActivityListFilters,
  ExpenseCategoryCreateInput,
  ExpenseCategoryUpdateInput,
  ExpenseListFilters,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  VehicleListFilters,
  VehicleCreateInput,
  VehicleUpdateInput,
  JobCardListFilters,
  JobCardByStatusFilters,
  JobCardCreateInput,
  JobCardUpdateInput,
  JobCardPartInput,
  JobCardAttachmentPayload,
  JobCardAttachmentPatch,
  JobInvoicePayload,
  WarrantyTemplateInput,
  WarrantyRowsInput,
  CarBrandCreateInput,
  CarBrandUpdateInput,
  ServiceCatalogListFilters,
  ServiceCatalogCreateInput,
  ServiceCatalogUpdateInput,
  ServiceListFilters,
  ServiceCreateInput,
  ServiceUpdateInput,
  CustomReceiptListFilters,
  CustomReceiptCreateInput,
  BackupSettingsUpdateInput,
  EmployeeListFilters,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  VacationCreateInput,
  EmployeeDocumentUploadInput,
  SalaryUpsertInput,
  StoreDocumentUploadInput,
  AttendanceCreateStatusInput,
  AttendanceUpdateStatusInput,
  AttendanceMarkInput,
  AttendanceBulkMarkInput,
  LoyaltyTransactionInput,
  LoyaltyAutoEarnParams,
  LoyaltyRedeemParams,
  TaskListFilters,
  TaskCreateInput,
  TaskUpdateInput,
  TaskDeliveryInput,
} from './types/ipc'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    login:          (credentials: LoginCredentials) =>
                      invoke('auth:login', credentials),
    logout:         () => invoke('auth:logout'),
    getSession:     () => invoke('auth:getSession'),
    changePassword: (data: ChangePasswordParams) =>
                      invoke('auth:changePassword', data),
    getAuthType:    (username: string) => invoke('auth:getAuthType', username),
    requestPasswordReset: (username: string) =>
      invoke('auth:requestPasswordReset', username),
    getPendingResetRequests: () => invoke('auth:getPendingResetRequests'),
    resolveResetRequest: (params: ResolveResetRequestParams) =>
      invoke('auth:resolveResetRequest', params),
    checkMustChangePassword: () => invoke('auth:checkMustChangePassword'),
    generateResetCode: (username: string) =>
      ipcRenderer.invoke('auth:generateResetCode', username),
    resetPassword: (params: DevResetPasswordParams) =>
      ipcRenderer.invoke('auth:resetPassword', params),
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: {
    getAll:  ()                              => invoke('settings:getAll'),
    get:     (key: string)                   => invoke('settings:get', key),
    set:     (key: string, value: string)    => invoke('settings:set', key, value),
    setBulk: (entries: Record<string, string>) => invoke('settings:setBulk', entries),
    getStoreStartDateMeta: ()                => invoke('settings:getStoreStartDateMeta'),
    setStoreStartDate: (value: string)       => invoke('settings:setStoreStartDate', value),
    clearStoreStartDate: ()                  => invoke('settings:clearStoreStartDate'),
  },

  // ── Products / Inventory ──────────────────────────────────────────────────
  products: {
    list:        (filters?: ProductListFilters)              => invoke('products:list', filters),
    getById:     (id: number)                                => invoke('products:getById', id),
    search:      (query: string)                             => invoke('products:search', query),
    findByBarcode:(barcode: string)                          => invoke('products:findByBarcode', barcode),
    create:      (data: ProductCreateInput)                  => invoke('products:create', data),
    update:      (id: number, data: ProductUpdateInput)      => invoke('products:update', id, data),
    delete:      (id: number)                                => invoke('products:delete', id),
    adjustStock: (id: number, adj: StockAdjustmentInput)     => invoke('products:adjustStock', id, adj),
    getLowStock: ()                                          => invoke('products:getLowStock'),
  },

  categories: {
    list:   ()                                          => invoke('categories:list'),
    create: (data: CategoryCreateInput)                 => invoke('categories:create', data),
    update: (id: number, data: CategoryUpdateInput)     => invoke('categories:update', id, data),
    delete: (id: number)                                => invoke('categories:delete', id),
  },

  brands: {
    list:   ()                                      => invoke('brands:list'),
    create: (data: BrandCreateInput)               => invoke('brands:create', data),
    update: (id: number, data: BrandUpdateInput)   => invoke('brands:update', id, data),
    delete: (id: number)                            => invoke('brands:delete', id),
  },

  suppliers: {
    list:   (filters?: SupplierListFilters)              => invoke('suppliers:list', filters),
    getById:(id: number)                                 => invoke('suppliers:getById', id),
    create: (data: SupplierCreateInput)                  => invoke('suppliers:create', data),
    update: (id: number, data: SupplierUpdateInput)      => invoke('suppliers:update', id, data),
    delete: (id: number)                                 => invoke('suppliers:delete', id),
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  customers: {
    list:    (filters?: CustomerListFilters)             => invoke('customers:list', filters),
    getById: (id: number)                                => invoke('customers:getById', id),
    create:  (data: CustomerCreateInput)                 => invoke('customers:create', data),
    update:  (id: number, data: CustomerUpdateInput)     => invoke('customers:update', id, data),
    delete:  (id: number)                                => invoke('customers:delete', id),
    search:  (query: string)                             => invoke('customers:search', query),
  },

  appointments: {
    list: (params: { from: string; to: string; department?: string; status?: string }) =>
      invoke('appointments:list', params),
    create: (data: AppointmentCreateInput) => invoke('appointments:create', data),
    getById: (id: number) => invoke('appointments:getById', id),
    updateStatus: (id: number, status: string) => invoke('appointments:updateStatus', id, status),
    convertToJobCard: (id: number, jobCardId: number) =>
      invoke('appointments:convertToJobCard', id, jobCardId),
    delete: (id: number) => invoke('appointments:delete', id),
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  sales: {
    list:    (filters?: SaleListFilters)                       => invoke('sales:list', filters),
    getById: (id: number)                                      => invoke('sales:getById', id),
    create:  (data: SaleCreateInput)                           => invoke('sales:create', data),
    void:    (id: number, reason: string)                      => invoke('sales:void', id, reason),
    saveDraft:    (data: SaleDraftInput)                       => invoke('sales:saveDraft', data),
    getDrafts:    ()                                           => invoke('sales:getDrafts'),
    getDraftById: (id: number)                                 => invoke('sales:getDraftById', id),
    deleteDraft:  (id: number)                                 => invoke('sales:deleteDraft', id),
    addPayment:   (saleId: number, data: SalePaymentInput)     => invoke('sales:addPayment', saleId, data),
  },

  // ── Repairs ───────────────────────────────────────────────────────────────
  repairs: {
    list:         (filters?: RepairListFilters)                      => invoke('repairs:list', filters),
    getByStatus:  ()                                                 => invoke('repairs:getByStatus'),
    getById:      (id: number)                                       => invoke('repairs:getById', id),
    create:       (data: RepairCreateInput)                          => invoke('repairs:create', data),
    update:       (id: number, data: RepairUpdateInput)              => invoke('repairs:update', id, data),
    updateStatus: (id: number, status: string, notes?: string) =>
                    invoke('repairs:updateStatus', id, status, notes),
    delete:       (id: number)                                       => invoke('repairs:delete', id),
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  cashDrawer: {
    summary: (filters?: { from?: string | null; to?: string | null }) =>
      invoke('cashDrawer:summary', filters ?? {}),
    list: (filters?: { from?: string | null; to?: string | null; limit?: number }) =>
      invoke('cashDrawer:list', filters ?? {}),
    setOpening: (payload: { businessDate: string; amount: number }) =>
      invoke('cashDrawer:setOpening', payload),
    addManual: (payload: {
      direction: 'in' | 'out'
      amount: number
      entry_type: string
      note?: string | null
      business_date?: string
    }) => invoke('cashDrawer:addManual', payload),
  },

  assets: {
    list:        (filters?: AssetListFilters)             => invoke('assets:list', filters ?? {}),
    categories:  ()                                       => invoke('assets:categories'),
    getById:     (id: number)                             => invoke('assets:getById', id),
    create:      (data: AssetCreateInput)                 => invoke('assets:create', data),
    update:      (id: number, data: AssetUpdateInput)     => invoke('assets:update', id, data),
    delete:      (id: number)                             => invoke('assets:delete', id),
  },

  reports: {
    salesDaily:      (dateFrom: string, dateTo?: string, department?: string) =>
                       invoke('reports:salesDaily', dateFrom, dateTo ?? dateFrom, department ?? 'all'),
    salesMonthly:    (year: number, month: number)       => invoke('reports:salesMonthly', year, month),
    profit:          (from: string, to: string, department?: string) =>
                       invoke('reports:profit', from, to, department ?? 'all'),
    departmentSummary: (from: string, to: string)        => invoke('reports:departmentSummary', from, to),
    cashByMethod:    (from: string, to?: string)         => invoke('reports:cashByMethod', from, to ?? from),
    topProducts:     (from: string, to: string)          => invoke('reports:topProducts', from, to),
    inventory:       ()                                  => invoke('reports:inventory'),
    lowStock:        ()                                  => invoke('reports:lowStock'),
    customerDebts:   (department?: string)               => invoke('reports:customerDebts', department ?? 'all'),
    assets:          ()                                  => invoke('reports:assets'),
    salaryReport:    (params: SalaryReportParams)        => invoke('reports:salaryReport', params),
    employeePerformance: (params: EmployeePerformanceParams) =>
      invoke('reports:employeePerformance', params),
    exportCsv:       (type: string, params: CsvExportParams) => invoke('reports:exportCsv', type, params),
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    getSummary:            () => invoke('reports:dashboard'),
    employeesAvailability: () => invoke('reports:employeesAvailability'),
    expiringDocuments:     (daysAhead?: number) => invoke('reports:expiringDocuments', daysAhead),
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  users: {
    list:               (filters?: UserListFilters)                            => invoke('users:list', filters),
    create:             (data: UserCreateInput)                                => invoke('users:create', data),
    update:             (id: number, data: UserUpdateInput)                    => invoke('users:update', id, data),
    delete:             (id: number)                                           => invoke('users:delete', id),
    resetPassword:      (id: number, pwd: string)                              => invoke('users:resetPassword', id, pwd),
    setPermissions:     (id: number, perms: string[])                          => invoke('users:setPermissions', id, perms),
    getAllPermissions:   ()                                                     => invoke('users:getAllPermissions'),
    getUserPermissions: (id: number)                                           => invoke('users:getUserPermissions', id),
    getRoleDefaults:    (role: string)                                         => invoke('users:getRoleDefaults', role),
    getUserOverrides:   (id: number)                                           => invoke('users:getUserOverrides', id),
    setOverride:        (id: number, key: string, granted: boolean)            => invoke('users:setOverride', id, key, granted),
    removeOverride:     (id: number, key: string)                              => invoke('users:removeOverride', id, key),
    setAuth:            (id: number, data: UserSetAuthInput) =>
      invoke('users:setAuth', id, data),
    getMyPreferences:    () => invoke('users:getMyPreferences'),
    updateMyPreferences: (patch: UserPreferencesPatch) => invoke('users:updateMyPreferences', patch),
  },

  // ── Backup ────────────────────────────────────────────────────────────────
  backup: {
    create:         ()                              => invoke('backup:create'),
    restore:        (filePath: string)              => invoke('backup:restore', filePath),
    selectFile:     ()                              => invoke('backup:selectFile'),
    getSettings:    ()                              => invoke('backup:getSettings'),
    updateSettings: (data: BackupSettingsUpdateInput) => invoke('backup:updateSettings', data),
    runNow:         ()                              => invoke('backup:runNow'),
    chooseFolder:   ()                              => invoke('backup:chooseFolder'),
    openFolder:     (folderPath: string)            => invoke('backup:openFolder', folderPath),
  },

  // ── License ───────────────────────────────────────────────────────────────
  license: {
    check:     ()               => invoke('license:check'),
    activate:  (key: string)    => invoke('license:activate', key),
    getStatus: ()               => invoke('license:getStatus'),
    getHwId:   ()               => invoke('license:getHwId'),
    getInfo:   ()               => invoke('license:getInfo'),
    hasFeature:(feature: string)=> invoke('license:hasFeature', feature),
    getTier:   ()               => invoke('license:getTier'),
    canAddUser:()               => invoke('license:canAddUser'),
  },

  // ── Partners ──────────────────────────────────────────────────────────────
  partners: {
    list:   (filters?: PartnerListFilters)             => invoke('partners:list', filters),
    getById:(id: number)                               => invoke('partners:getById', id),
    create: (data: PartnerCreateInput)                 => invoke('partners:create', data),
    update: (id: number, data: PartnerUpdateInput)     => invoke('partners:update', id, data),
    delete: (id: number)                               => invoke('partners:delete', id),
  },

  // ── Activity Log ──────────────────────────────────────────────────────────
  activity: {
    list: (filters?: ActivityListFilters) => invoke('activity:list', filters),
  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  expenseCategories: {
    list:   ()                                                  => invoke('expenseCategories:list'),
    create: (data: ExpenseCategoryCreateInput)                  => invoke('expenseCategories:create', data),
    update: (id: number, data: ExpenseCategoryUpdateInput)      => invoke('expenseCategories:update', id, data),
    delete: (id: number)                                        => invoke('expenseCategories:delete', id),
  },
  expenses: {
    list:           (filters?: ExpenseListFilters)              => invoke('expenses:list', filters),
    getById:        (id: number)                                => invoke('expenses:getById', id),
    create:         (data: ExpenseCreateInput)                  => invoke('expenses:create', data),
    update:         (id: number, data: ExpenseUpdateInput)      => invoke('expenses:update', id, data),
    delete:         (id: number)                                => invoke('expenses:delete', id),
    selectReceipt:  ()                                          => invoke('expenses:selectReceipt'),
    openReceipt:    (filePath: string)                          => invoke('expenses:openReceipt', filePath),
    sumByCategory:  (from: string, to: string, department?: string) =>
                        invoke('expenses:sumByCategory', from, to, department ?? 'all'),
    sumByMonth:     (year: number, department?: string) =>
                        invoke('expenses:sumByMonth', year, department ?? 'all'),
    upcomingDue:    (days?: number)                             => invoke('expenses:upcomingDue', days),
    markPaid:       (id: number)                                => invoke('expenses:markPaid', id),
  },

  // ── Vehicles ─────────────────────────────────────────────────────────────
  vehicles: {
    list:       (filters?: VehicleListFilters)             => invoke('vehicles:list', filters),
    getById:    (id: number)                               => invoke('vehicles:getById', id),
    create:     (data: VehicleCreateInput)                 => invoke('vehicles:create', data),
    update:     (id: number, data: VehicleUpdateInput)     => invoke('vehicles:update', id, data),
    delete:     (id: number)                               => invoke('vehicles:delete', id),
    getByOwner: (ownerId: number)                          => invoke('vehicles:getByOwner', ownerId),
  },

  // ── Job Cards ───────────────────────────────────────────────────────────
  jobCards: {
    list:           (filters?: JobCardListFilters)                           => invoke('jobCards:list', filters),
    getByStatus:    (filters?: JobCardByStatusFilters)                       => invoke('jobCards:getByStatus', filters),
    getById:        (id: number)                                             => invoke('jobCards:getById', id),
    create:         (data: JobCardCreateInput)                               => invoke('jobCards:create', data),
    update:         (id: number, data: JobCardUpdateInput)                   => invoke('jobCards:update', id, data),
    updateStatus:   (id: number, status: string)                             => invoke('jobCards:updateStatus', id, status),
    delete:         (id: number)                                             => invoke('jobCards:delete', id),
    addPart:        (jobCardId: number, part: JobCardPartInput)              => invoke('jobCards:addPart', jobCardId, part),
    removePart:     (partId: number)                                         => invoke('jobCards:removePart', partId),
    getForVehicle:  (vehicleId: number)                                      => invoke('jobCards:getForVehicle', vehicleId),
    listProgressComments: (jobCardId: number)                                => invoke('jobCards:listProgressComments', jobCardId),
    listLogs: (jobCardId: number)                                            => invoke('jobCards:listLogs', jobCardId),
    listAttachments: (jobCardId: number)                                     => invoke('jobCards:listAttachments', jobCardId),
    addAttachment: (jobCardId: number, payload: JobCardAttachmentPayload)    => invoke('jobCards:addAttachment', jobCardId, payload),
    updateAttachment: (attachmentId: number, patch: JobCardAttachmentPatch)  => invoke('jobCards:updateAttachment', attachmentId, patch),
    deleteAttachment: (attachmentId: number)                                 => invoke('jobCards:deleteAttachment', attachmentId),
    openAttachment: (attachmentId: number)                                   => invoke('jobCards:openAttachment', attachmentId),
    addProgressComment:   (jobCardId: number, text: string)                  => invoke('jobCards:addProgressComment', jobCardId, text),
    deleteProgressComment: (commentId: number)                               => invoke('jobCards:deleteProgressComment', commentId),
    createJobInvoice:     (jobCardId: number, payload?: JobInvoicePayload)   => invoke('jobCards:createJobInvoice', jobCardId, payload),
    updateJobInvoice:     (invoiceId: number, payload: JobInvoicePayload)    => invoke('jobCards:updateJobInvoice', invoiceId, payload),
    patchJobInvoiceInspection: (invoiceId: number, include: boolean) =>
      invoke('jobCards:patchJobInvoiceInspection', invoiceId, include),
    getJobInvoice:        (invoiceId: number)                               => invoke('jobCards:getJobInvoice', invoiceId),
    getJobInvoiceForJob:  (jobCardId: number)                               => invoke('jobCards:getJobInvoiceForJob', jobCardId),
    listJobInvoices:      (filters?: { search?: string })                   => invoke('jobCards:listJobInvoices', filters),
    deleteJobInvoice:     (invoiceId: number)                               => invoke('jobCards:deleteJobInvoice', invoiceId),
    listWarrantyTemplates: (activeOnly?: boolean)                           => invoke('jobCards:listWarrantyTemplates', activeOnly),
    createWarrantyTemplate: (data: WarrantyTemplateInput)                  => invoke('jobCards:createWarrantyTemplate', data),
    updateWarrantyTemplate: (id: number, data: WarrantyTemplateInput)      => invoke('jobCards:updateWarrantyTemplate', id, data),
    deleteWarrantyTemplate: (id: number)                                   => invoke('jobCards:deleteWarrantyTemplate', id),
    listJobInvoiceWarranties: (invoiceId: number)                          => invoke('jobCards:listJobInvoiceWarranties', invoiceId),
    listWarrantiesForJob: (jobCardId: number)                              => invoke('jobCards:listWarrantiesForJob', jobCardId),
    replaceJobInvoiceWarranties: (jobCardId: number, invoiceId: number, rows: WarrantyRowsInput) =>
      invoke('jobCards:replaceJobInvoiceWarranties', jobCardId, invoiceId, rows),
    dismissJobInvoiceAutoWarranty: (jobCardId: number, invoiceId: number, warrantyId: number) =>
      invoke('jobCards:dismissJobInvoiceAutoWarranty', jobCardId, invoiceId, warrantyId),
  },

  carBrands: {
    list:   ()                                            => invoke('carBrands:list'),
    create: (data: CarBrandCreateInput)                   => invoke('carBrands:create', data),
    update: (id: number, data: CarBrandUpdateInput)       => invoke('carBrands:update', id, data),
    delete: (id: number)                                  => invoke('carBrands:delete', id),
  },

  serviceCatalog: {
    list:       (filters?: ServiceCatalogListFilters)              => invoke('serviceCatalog:list', filters),
    search:     (query: string)                                    => invoke('serviceCatalog:search', query),
    forVehicle: (make: string, model: string)                      => invoke('serviceCatalog:forVehicle', make, model),
    create:     (data: ServiceCatalogCreateInput)                  => invoke('serviceCatalog:create', data),
    update:     (id: number, data: ServiceCatalogUpdateInput)      => invoke('serviceCatalog:update', id, data),
    delete:     (id: number)                                       => invoke('serviceCatalog:delete', id),
  },

  // ── Services Catalog ────────────────────────────────────────────────────
  services: {
    list:           (filters?: ServiceListFilters)             => invoke('services:list', filters),
    getById:        (id: number)                               => invoke('services:getById', id),
    create:         (data: ServiceCreateInput)                 => invoke('services:create', data),
    update:         (id: number, data: ServiceUpdateInput)     => invoke('services:update', id, data),
    delete:         (id: number)                               => invoke('services:delete', id),
    getCategories:  ()                                         => invoke('services:getCategories'),
  },

  // ── Job Types ──────────────────────────────────────────────────────────
  jobTypes: {
    listAll:    ()                                              => invoke('jobTypes:listAll'),
    listActive: ()                                              => invoke('jobTypes:listActive'),
    create:     (data: { name: string; description?: string; is_active?: boolean }) => invoke('jobTypes:create', data),
    update:     (id: number, data: { name?: string; description?: string; is_active?: boolean }) => invoke('jobTypes:update', id, data),
    delete:     (id: number)                                    => invoke('jobTypes:delete', id),
    reorder:    (id: number, direction: 'up' | 'down')          => invoke('jobTypes:reorder', id, direction),
  },

  // ── Custom Receipts ─────────────────────────────────────────────────────
  customReceipts: {
    list:     (filters?: CustomReceiptListFilters)     => invoke('customReceipts:list', filters),
    getById:  (id: number)                             => invoke('customReceipts:getById', id),
    create:   (data: CustomReceiptCreateInput)         => invoke('customReceipts:create', data),
    delete:   (id: number)                             => invoke('customReceipts:delete', id),
  },

  print: {
    receipt:              (html: string) => invoke('print:receipt', html),
    idCard:               (html: string, format: 'pdf' | 'png' = 'pdf') =>
      invoke('print:idCard', html, format),
    chooseDownloadFolder: ()             => invoke('print:chooseDownloadFolder'),
    listPrinters:         () => invoke('print:listPrinters'),
    thermal:              (html: string, printerName: string) =>
      invoke('print:thermal', html, printerName),
  },

  // ── Employees (HR) ────────────────────────────────────────────────────────
  employees: {
    list:            (filters?: EmployeeListFilters)                             => invoke('employees:list', filters),
    getById:         (id: number)                                                => invoke('employees:getById', id),
    create:          (data: EmployeeCreateInput)                                 => invoke('employees:create', data),
    previewNextId:   ()                                                          => invoke('employees:previewNextId'),
    update:          (id: number, data: EmployeeUpdateInput)                     => invoke('employees:update', id, data),
    delete:          (id: number)                                                => invoke('employees:delete', id),
    listVacations:   (employeeId: number)                                        => invoke('employees:listVacations', employeeId),
    addVacation:     (data: VacationCreateInput)                                 => invoke('employees:addVacation', data),
    endVacation:     (vacationId: number, actualReturnDate: string)              => invoke('employees:endVacation', vacationId, actualReturnDate),
    deleteVacation:  (vacationId: number)                                        => invoke('employees:deleteVacation', vacationId),
    listDocuments:   (employeeId: number)                                        => invoke('employees:listDocuments', employeeId),
    uploadDocument:  (data: EmployeeDocumentUploadInput)                         => invoke('employees:uploadDocument', data),
    openDocument:    (docId: number)                                             => invoke('employees:openDocument', docId),
    deleteDocument:  (docId: number)                                             => invoke('employees:deleteDocument', docId),
    chooseFile:      ()                                                          => invoke('employees:chooseFile'),
    getSalary:       (employeeId: number)                                        => invoke('employees:getSalary', employeeId),
    upsertSalary:    (data: SalaryUpsertInput)                                   => invoke('employees:upsertSalary', data),
    listPayroll:     (filter?: 'all' | 'paid' | 'unpaid' | 'overdue')           => invoke('employees:listPayroll', filter ?? 'all'),
    markSalaryPaid: (
      employeeId: number,
      extras?: {
        overtime_hours?: number
        overtime_rate?: number
        overtime_amount?: number
        bonus_amount?: number
        bonus_type?: string
        bonus_note?: string
        absence_deduction?: number
        absence_days?: number
        notes?: string
      },
    ) => invoke('employees:markSalaryPaid', employeeId, extras),
  },

  storeDocuments: {
    list: () => invoke('storeDocuments:list'),
    upload: (data: StoreDocumentUploadInput) => invoke('storeDocuments:upload', data),
    delete: (id: number) => invoke('storeDocuments:delete', id),
    openFile: (filePath: string) => invoke('storeDocuments:openFile', filePath),
    showInFolder: (filePath: string) => invoke('storeDocuments:showInFolder', filePath),
  },

  attendance: {
    getStatuses: () => invoke('attendance:getStatuses'),
    createStatus: (data: AttendanceCreateStatusInput) => invoke('attendance:createStatus', data),
    updateStatus: (id: number, data: AttendanceUpdateStatusInput) =>
      invoke('attendance:updateStatus', id, data),
    deleteStatus: (id: number) => invoke('attendance:deleteStatus', id),
    mark: (data: AttendanceMarkInput) => invoke('attendance:mark', data),
    bulkMark: (data: AttendanceBulkMarkInput) => invoke('attendance:bulkMark', data),
    getMonthly: (employeeId: number, year: number, month: number) =>
      invoke('attendance:getMonthly', employeeId, year, month),
    getSummary: (employeeId: number, year: number, month: number) =>
      invoke('attendance:getSummary', employeeId, year, month),
    getReport: (employeeId: number, from: string, to: string) =>
      invoke('attendance:getReport', employeeId, from, to),
  },

  // ── App (activation window) ───────────────────────────────────────────────
  app: {
    licenseActivated: () => ipcRenderer.send('app:licenseActivated'),
    getVersion: () => invoke<string>('app:getVersion'),
    checkForUpdates: () =>
      invoke<{
        success: boolean
        data: {
          hasUpdate: boolean
          currentVersion: string
          latestVersion?: string
          releaseName?: string
          releaseUrl?: string
          publishedAt?: string
          releaseNotes?: string
          error?: string
          downloadUrl?: string | null
          downloadSize?: number | null
        }
      }>('app:checkForUpdates'),
    downloadUpdate: (downloadUrl: string) =>
      invoke<{
        success: boolean
        data?: { filePath: string; fileName: string }
        error?: string
      }>('app:downloadUpdate', downloadUrl),
    installUpdate: (filePath: string) =>
      invoke<{ success: boolean; error?: string }>(
        'app:installUpdate',
        filePath
      ),
    onDownloadProgress: (
      callback: (data: {
        progress: number
        downloadedBytes: number
        totalBytes: number
      }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: {
          progress: number
          downloadedBytes: number
          totalBytes: number
        }
      ) => {
        callback(data)
      }
      ipcRenderer.on('app:downloadProgress', handler)
      return () => {
        ipcRenderer.removeListener('app:downloadProgress', handler)
      }
    },
  },

  shell: {
    openExternal: (url: string) => invoke<void>('shell:openExternal', url),
  },

  tv: {
    open: () => invoke('tv:open'),
    close: () => invoke('tv:close'),
    listDisplays: () => invoke('tv:listDisplays'),
  },

  loyalty: {
    get: (customerId: number, department?: string) =>
      invoke('loyalty:get', customerId, department),
    getAllDepts: (customerId: number) =>
      invoke('loyalty:getAllDepts', customerId),
    addTransaction: (data: LoyaltyTransactionInput) =>
      invoke('loyalty:addTransaction', data),
    getTransactions: (
      customerId: number,
      department?: string,
      limit?: number
    ) => invoke(
      'loyalty:getTransactions',
      customerId,
      department,
      limit
    ),
    processAutoEarn: (params: LoyaltyAutoEarnParams) =>
      invoke('loyalty:processAutoEarn', params),
    redeemReward: (params: LoyaltyRedeemParams) =>
      invoke('loyalty:redeemReward', params),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  tasks: {
    list:            (filters?: TaskListFilters)                   => invoke('tasks:list', filters),
    getById:         (id: number)                                  => invoke('tasks:getById', id),
    create:          (data: TaskCreateInput)                       => invoke('tasks:create', data),
    update:          (id: number, data: TaskUpdateInput)           => invoke('tasks:update', id, data),
    delete:          (id: number)                                  => invoke('tasks:delete', id),
    getForCalendar:  (dateFrom: string, dateTo: string)            => invoke('tasks:getForCalendar', dateFrom, dateTo),
    setAssignees:    (taskId: number, userIds: number[])           => invoke('tasks:setAssignees', taskId, userIds),
    createDelivery:  (data: TaskDeliveryInput)                     => invoke('tasks:createDelivery', data),
    getSummary:      ()                                            => invoke('tasks:getSummary'),
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    list:           (limit?: number) => invoke('notifications:list', limit),
    getUnreadCount: ()               => invoke('notifications:getUnreadCount'),
    markRead:       (id: number)     => invoke('notifications:markRead', id),
    markAllRead:    ()               => invoke('notifications:markAllRead'),
  },
})

// TypeScript type augmentation — this is used by the renderer
export {}
