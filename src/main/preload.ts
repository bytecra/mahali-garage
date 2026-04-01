import { contextBridge, ipcRenderer } from 'electron'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    login:          (credentials: { username: string; password: string }) =>
                      invoke('auth:login', credentials),
    logout:         () => invoke('auth:logout'),
    getSession:     () => invoke('auth:getSession'),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
                      invoke('auth:changePassword', data),
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: {
    getAll:  ()                              => invoke('settings:getAll'),
    get:     (key: string)                   => invoke('settings:get', key),
    set:     (key: string, value: string)    => invoke('settings:set', key, value),
    setBulk: (entries: Record<string, string>) => invoke('settings:setBulk', entries),
  },

  // ── Products / Inventory ──────────────────────────────────────────────────
  products: {
    list:        (filters?: unknown)         => invoke('products:list', filters),
    getById:     (id: number)               => invoke('products:getById', id),
    search:      (query: string)            => invoke('products:search', query),
    findByBarcode:(barcode: string)         => invoke('products:findByBarcode', barcode),
    create:      (data: unknown)            => invoke('products:create', data),
    update:      (id: number, data: unknown) => invoke('products:update', id, data),
    delete:      (id: number)               => invoke('products:delete', id),
    adjustStock: (id: number, adj: unknown)  => invoke('products:adjustStock', id, adj),
    getLowStock: ()                          => invoke('products:getLowStock'),
  },

  categories: {
    list:   ()                             => invoke('categories:list'),
    create: (data: unknown)               => invoke('categories:create', data),
    update: (id: number, data: unknown)   => invoke('categories:update', id, data),
    delete: (id: number)                  => invoke('categories:delete', id),
  },

  brands: {
    list:   ()                            => invoke('brands:list'),
    create: (data: unknown)              => invoke('brands:create', data),
    update: (id: number, data: unknown)  => invoke('brands:update', id, data),
    delete: (id: number)                 => invoke('brands:delete', id),
  },

  suppliers: {
    list:   (filters?: unknown)           => invoke('suppliers:list', filters),
    getById:(id: number)                 => invoke('suppliers:getById', id),
    create: (data: unknown)              => invoke('suppliers:create', data),
    update: (id: number, data: unknown)  => invoke('suppliers:update', id, data),
    delete: (id: number)                 => invoke('suppliers:delete', id),
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  customers: {
    list:    (filters?: unknown)          => invoke('customers:list', filters),
    getById: (id: number)                => invoke('customers:getById', id),
    create:  (data: unknown)             => invoke('customers:create', data),
    update:  (id: number, data: unknown) => invoke('customers:update', id, data),
    delete:  (id: number)                => invoke('customers:delete', id),
    search:  (query: string)             => invoke('customers:search', query),
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  sales: {
    list:    (filters?: unknown)          => invoke('sales:list', filters),
    getById: (id: number)                => invoke('sales:getById', id),
    create:  (data: unknown)             => invoke('sales:create', data),
    void:    (id: number, reason: string) => invoke('sales:void', id, reason),
    saveDraft:    (data: unknown)        => invoke('sales:saveDraft', data),
    getDrafts:    ()                     => invoke('sales:getDrafts'),
    getDraftById: (id: number)           => invoke('sales:getDraftById', id),
    deleteDraft:  (id: number)           => invoke('sales:deleteDraft', id),
    addPayment:   (saleId: number, data: unknown) => invoke('sales:addPayment', saleId, data),
  },

  payments: {
    addPayment: (saleId: number, data: unknown) => invoke('payments:add', saleId, data),
    getForSale: (saleId: number)                => invoke('payments:getForSale', saleId),
  },

  invoices: {
    getForSale:    (saleId: number)  => invoke('invoices:getForSale', saleId),
    generatePdf:   (invoiceId: number) => invoke('invoices:generatePdf', invoiceId),
    print:         (invoiceId: number) => invoke('invoices:print', invoiceId),
    openPdf:       (invoiceId: number) => invoke('invoices:openPdf', invoiceId),
  },

  // ── Repairs ───────────────────────────────────────────────────────────────
  repairs: {
    list:         (filters?: unknown)                     => invoke('repairs:list', filters),
    getByStatus:  ()                                     => invoke('repairs:getByStatus'),
    getById:      (id: number)                           => invoke('repairs:getById', id),
    create:       (data: unknown)                        => invoke('repairs:create', data),
    update:       (id: number, data: unknown)            => invoke('repairs:update', id, data),
    updateStatus: (id: number, status: string, notes?: string) =>
                    invoke('repairs:updateStatus', id, status, notes),
    delete:       (id: number)                           => invoke('repairs:delete', id),
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
    list:        (filters?: unknown)         => invoke('assets:list', filters ?? {}),
    categories:  ()                          => invoke('assets:categories'),
    getById:     (id: number)                => invoke('assets:getById', id),
    create:      (data: unknown)           => invoke('assets:create', data),
    update:      (id: number, data: unknown) => invoke('assets:update', id, data),
    delete:      (id: number)               => invoke('assets:delete', id),
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
    customerDebts:   (department?: string)              => invoke('reports:customerDebts', department ?? 'all'),
    assets:          ()                               => invoke('reports:assets'),
    exportCsv:       (type: string, params: unknown)     => invoke('reports:exportCsv', type, params),
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    getSummary: () => invoke('reports:dashboard'),
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  users: {
    list:               (filters?: unknown)                          => invoke('users:list', filters),
    create:             (data: unknown)                              => invoke('users:create', data),
    update:             (id: number, data: unknown)                  => invoke('users:update', id, data),
    delete:             (id: number)                                 => invoke('users:delete', id),
    resetPassword:      (id: number, pwd: string)                   => invoke('users:resetPassword', id, pwd),
    setPermissions:     (id: number, perms: string[])                => invoke('users:setPermissions', id, perms),
    getAllPermissions:   ()                                           => invoke('users:getAllPermissions'),
    getUserPermissions: (id: number)                                 => invoke('users:getUserPermissions', id),
    getRoleDefaults:    (role: string)                               => invoke('users:getRoleDefaults', role),
    getUserOverrides:   (id: number)                                 => invoke('users:getUserOverrides', id),
    setOverride:        (id: number, key: string, granted: boolean)  => invoke('users:setOverride', id, key, granted),
    removeOverride:     (id: number, key: string)                    => invoke('users:removeOverride', id, key),
  },

  // ── Backup ────────────────────────────────────────────────────────────────
  backup: {
    create:         ()                     => invoke('backup:create'),
    restore:        (filePath: string)     => invoke('backup:restore', filePath),
    selectFile:     ()                     => invoke('backup:selectFile'),
    getSettings:    ()                     => invoke('backup:getSettings'),
    updateSettings: (data: unknown)        => invoke('backup:updateSettings', data),
    runNow:         ()                     => invoke('backup:runNow'),
    chooseFolder:   ()                     => invoke('backup:chooseFolder'),
    openFolder:     (folderPath: string)   => invoke('backup:openFolder', folderPath),
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
    list:   (filters?: unknown)           => invoke('partners:list', filters),
    getById:(id: number)                 => invoke('partners:getById', id),
    create: (data: unknown)              => invoke('partners:create', data),
    update: (id: number, data: unknown)  => invoke('partners:update', id, data),
    delete: (id: number)                 => invoke('partners:delete', id),
  },

  // ── Activity Log ──────────────────────────────────────────────────────────
  activity: {
    list: (filters?: unknown) => invoke('activity:list', filters),
  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  expenseCategories: {
    list:   ()                          => invoke('expenseCategories:list'),
    create: (data: unknown)             => invoke('expenseCategories:create', data),
    update: (id: number, data: unknown) => invoke('expenseCategories:update', id, data),
    delete: (id: number)                => invoke('expenseCategories:delete', id),
  },
  expenses: {
    list:           (filters?: unknown)             => invoke('expenses:list', filters),
    getById:        (id: number)                    => invoke('expenses:getById', id),
    create:         (data: unknown)                 => invoke('expenses:create', data),
    update:         (id: number, data: unknown)     => invoke('expenses:update', id, data),
    delete:         (id: number)                    => invoke('expenses:delete', id),
    selectReceipt:  ()                              => invoke('expenses:selectReceipt'),
    openReceipt:    (filePath: string)              => invoke('expenses:openReceipt', filePath),
    sumByCategory:  (from: string, to: string, department?: string) =>
                        invoke('expenses:sumByCategory', from, to, department ?? 'all'),
    sumByMonth:     (year: number, department?: string) =>
                        invoke('expenses:sumByMonth', year, department ?? 'all'),
    upcomingDue:    (days?: number)                 => invoke('expenses:upcomingDue', days),
    markPaid:       (id: number)                    => invoke('expenses:markPaid', id),
  },

  // ── Vehicles ─────────────────────────────────────────────────────────────
  vehicles: {
    list:       (filters?: unknown)           => invoke('vehicles:list', filters),
    getById:    (id: number)                 => invoke('vehicles:getById', id),
    create:     (data: unknown)              => invoke('vehicles:create', data),
    update:     (id: number, data: unknown)  => invoke('vehicles:update', id, data),
    delete:     (id: number)                 => invoke('vehicles:delete', id),
    getByOwner: (ownerId: number)            => invoke('vehicles:getByOwner', ownerId),
  },

  // ── Job Cards ───────────────────────────────────────────────────────────
  jobCards: {
    list:           (filters?: unknown)                              => invoke('jobCards:list', filters),
    getByStatus:    ()                                              => invoke('jobCards:getByStatus'),
    getById:        (id: number)                                    => invoke('jobCards:getById', id),
    create:         (data: unknown)                                 => invoke('jobCards:create', data),
    update:         (id: number, data: unknown)                     => invoke('jobCards:update', id, data),
    updateStatus:   (id: number, status: string)                    => invoke('jobCards:updateStatus', id, status),
    delete:         (id: number)                                    => invoke('jobCards:delete', id),
    addPart:        (jobCardId: number, part: unknown)              => invoke('jobCards:addPart', jobCardId, part),
    removePart:     (partId: number)                                => invoke('jobCards:removePart', partId),
    getForVehicle:  (vehicleId: number)                             => invoke('jobCards:getForVehicle', vehicleId),
  },

  carBrands: {
    list:   ()                                    => invoke('carBrands:list'),
    create: (data: unknown)                       => invoke('carBrands:create', data),
    update: (id: number, data: unknown)          => invoke('carBrands:update', id, data),
    delete: (id: number)                          => invoke('carBrands:delete', id),
  },

  serviceCatalog: {
    list:       (filters?: unknown)              => invoke('serviceCatalog:list', filters),
    forVehicle: (make: string, model: string)    => invoke('serviceCatalog:forVehicle', make, model),
    create:     (data: unknown)                  => invoke('serviceCatalog:create', data),
    update:     (id: number, data: unknown)      => invoke('serviceCatalog:update', id, data),
    delete:     (id: number)                     => invoke('serviceCatalog:delete', id),
  },

  // ── Services Catalog ────────────────────────────────────────────────────
  services: {
    list:           (filters?: unknown)           => invoke('services:list', filters),
    getById:        (id: number)                 => invoke('services:getById', id),
    create:         (data: unknown)              => invoke('services:create', data),
    update:         (id: number, data: unknown)  => invoke('services:update', id, data),
    delete:         (id: number)                 => invoke('services:delete', id),
    getCategories:  ()                           => invoke('services:getCategories'),
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
    list:     (filters?: unknown)           => invoke('customReceipts:list', filters),
    getById:  (id: number)                 => invoke('customReceipts:getById', id),
    create:   (data: unknown)              => invoke('customReceipts:create', data),
    delete:   (id: number)                 => invoke('customReceipts:delete', id),
  },

  print: {
    receipt:              (html: string) => invoke('print:receipt', html),
    chooseDownloadFolder: ()             => invoke('print:chooseDownloadFolder'),
  },

  // ── Employees (HR) ────────────────────────────────────────────────────────
  employees: {
    list:            (filters?: unknown)                               => invoke('employees:list', filters),
    getById:         (id: number)                                     => invoke('employees:getById', id),
    create:          (data: unknown)                                  => invoke('employees:create', data),
    update:          (id: number, data: unknown)                      => invoke('employees:update', id, data),
    delete:          (id: number)                                     => invoke('employees:delete', id),
    listVacations:   (employeeId: number)                             => invoke('employees:listVacations', employeeId),
    addVacation:     (data: unknown)                                  => invoke('employees:addVacation', data),
    endVacation:     (vacationId: number, actualReturnDate: string)   => invoke('employees:endVacation', vacationId, actualReturnDate),
    deleteVacation:  (vacationId: number)                             => invoke('employees:deleteVacation', vacationId),
    listDocuments:   (employeeId: number)                             => invoke('employees:listDocuments', employeeId),
    uploadDocument:  (data: unknown)                                  => invoke('employees:uploadDocument', data),
    openDocument:    (docId: number)                                  => invoke('employees:openDocument', docId),
    deleteDocument:  (docId: number)                                  => invoke('employees:deleteDocument', docId),
    chooseFile:      ()                                               => invoke('employees:chooseFile'),
    getSalary:       (employeeId: number)                              => invoke('employees:getSalary', employeeId),
    upsertSalary:    (data: unknown)                                   => invoke('employees:upsertSalary', data),
    listPayroll:     (filter?: 'all' | 'paid' | 'unpaid' | 'overdue')  => invoke('employees:listPayroll', filter ?? 'all'),
    markSalaryPaid:  (employeeId: number)                              => invoke('employees:markSalaryPaid', employeeId),
  },

  // ── App (activation window) ───────────────────────────────────────────────
  app: {
    licenseActivated: () => ipcRenderer.send('app:licenseActivated'),
  },

  tv: {
    open: () => invoke('tv:open'),
    listDisplays: () => invoke('tv:listDisplays'),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────
  tasks: {
    list:            (filters?: unknown)                      => invoke('tasks:list', filters),
    getById:         (id: number)                            => invoke('tasks:getById', id),
    create:          (data: unknown)                         => invoke('tasks:create', data),
    update:          (id: number, data: unknown)             => invoke('tasks:update', id, data),
    delete:          (id: number)                            => invoke('tasks:delete', id),
    getForCalendar:  (dateFrom: string, dateTo: string)      => invoke('tasks:getForCalendar', dateFrom, dateTo),
    setAssignees:    (taskId: number, userIds: number[])     => invoke('tasks:setAssignees', taskId, userIds),
    createDelivery:  (data: unknown)                         => invoke('tasks:createDelivery', data),
    getSummary:      ()                                      => invoke('tasks:getSummary'),
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
