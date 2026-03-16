export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface SessionData {
  userId: number
  username: string
  fullName: string
  role: string
  permissions: string[]
}

declare global {
  interface Window {
    electronAPI: {
      auth: {
        login: (credentials: { username: string; password: string }) => Promise<IpcResponse<SessionData>>
        logout: () => Promise<IpcResponse<null>>
        getSession: () => Promise<IpcResponse<SessionData | null>>
        changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<IpcResponse<null>>
      }
      settings: {
        getAll: () => Promise<IpcResponse<Record<string, string>>>
        get: (key: string) => Promise<IpcResponse<string | null>>
        set: (key: string, value: string) => Promise<IpcResponse<null>>
        setBulk: (entries: Record<string, string>) => Promise<IpcResponse<null>>
      }
      products: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        search: (query: string) => Promise<IpcResponse<unknown[]>>
        findByBarcode: (barcode: string) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
        adjustStock: (id: number, adj: unknown) => Promise<IpcResponse<null>>
        getLowStock: () => Promise<IpcResponse<unknown[]>>
      }
      categories: {
        list: () => Promise<IpcResponse<unknown[]>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      brands: {
        list: () => Promise<IpcResponse<unknown[]>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      suppliers: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      partners: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown[]>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      customers: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
        search: (query: string) => Promise<IpcResponse<unknown[]>>
      }
      sales: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        void: (id: number, reason: string) => Promise<IpcResponse<null>>
        addPayment: (saleId: number, data: unknown) => Promise<IpcResponse<null>>
        saveDraft: (data: unknown) => Promise<IpcResponse<unknown>>
        getDrafts: () => Promise<IpcResponse<unknown[]>>
        getDraftById: (id: number) => Promise<IpcResponse<unknown>>
        deleteDraft: (id: number) => Promise<IpcResponse<null>>
      }
      payments: {
        addPayment: (saleId: number, data: unknown) => Promise<IpcResponse<null>>
        getForSale: (saleId: number) => Promise<IpcResponse<unknown[]>>
      }
      invoices: {
        getForSale: (saleId: number) => Promise<IpcResponse<unknown>>
        generatePdf: (invoiceId: number) => Promise<IpcResponse<string>>
        print: (invoiceId: number) => Promise<IpcResponse<null>>
        openPdf: (invoiceId: number) => Promise<IpcResponse<null>>
      }
      repairs: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getByStatus: () => Promise<IpcResponse<unknown[]>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        updateStatus: (id: number, status: string, notes?: string) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      reports: {
        salesDaily: (date: string) => Promise<IpcResponse<unknown>>
        salesMonthly: (year: number, month: number) => Promise<IpcResponse<unknown>>
        profit: (from: string, to: string) => Promise<IpcResponse<unknown>>
        topProducts: (from: string, to: string) => Promise<IpcResponse<unknown[]>>
        inventory: () => Promise<IpcResponse<unknown[]>>
        lowStock: () => Promise<IpcResponse<unknown[]>>
        customerDebts: () => Promise<IpcResponse<unknown[]>>
        exportCsv: (type: string, params: unknown) => Promise<IpcResponse<string>>
      }
      dashboard: {
        getSummary: () => Promise<IpcResponse<unknown>>
      }
      users: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
        resetPassword: (id: number, pwd: string) => Promise<IpcResponse<null>>
        setPermissions: (id: number, perms: string[]) => Promise<IpcResponse<null>>
        getAllPermissions: () => Promise<IpcResponse<unknown[]>>
        getUserPermissions: (id: number) => Promise<IpcResponse<unknown[]>>
        getRoleDefaults: (role: string) => Promise<IpcResponse<string[]>>
        getUserOverrides: (id: number) => Promise<IpcResponse<{ key: string; granted: boolean; description: string | null }[]>>
        setOverride: (id: number, key: string, granted: boolean) => Promise<IpcResponse<null>>
        removeOverride: (id: number, key: string) => Promise<IpcResponse<null>>
      }
      backup: {
        create: () => Promise<IpcResponse<unknown>>
        restore: (filePath: string) => Promise<IpcResponse<unknown>>
        selectFile: () => Promise<IpcResponse<string | null>>
      }
      activity: {
        list: (filters?: unknown) => Promise<IpcResponse<{ rows: unknown[]; total: number }>>
      }
      expenseCategories: {
        list:   ()                          => Promise<IpcResponse<unknown[]>>
        create: (data: unknown)             => Promise<IpcResponse<{ id: number }>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number)                => Promise<IpcResponse<null>>
      }
      expenses: {
        list:          (filters?: unknown)         => Promise<IpcResponse<{ rows: unknown[]; total: number }>>
        getById:       (id: number)                => Promise<IpcResponse<unknown>>
        create:        (data: unknown)             => Promise<IpcResponse<{ id: number }>>
        update:        (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete:        (id: number)                => Promise<IpcResponse<null>>
        selectReceipt: ()                          => Promise<IpcResponse<string | null>>
        openReceipt:   (filePath: string)          => Promise<IpcResponse<null>>
        sumByCategory: (from: string, to: string)  => Promise<IpcResponse<unknown[]>>
        sumByMonth:    (year: number)              => Promise<IpcResponse<unknown[]>>
      }
      license: {
        check: () => Promise<IpcResponse<unknown>>
        activate: (key: string) => Promise<IpcResponse<unknown>>
        getStatus: () => Promise<IpcResponse<unknown>>
        getHwId: () => Promise<IpcResponse<string>>
      }
      app: {
        licenseActivated: () => void
      }
      tasks: {
        list:           (filters?: unknown) => Promise<IpcResponse<{ rows: unknown[]; total: number; page: number; pageSize: number }>>
        getById:        (id: number) => Promise<IpcResponse<unknown>>
        create:         (data: unknown) => Promise<IpcResponse<{ id: number }>>
        update:         (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete:         (id: number) => Promise<IpcResponse<null>>
        getForCalendar: (dateFrom: string, dateTo: string) => Promise<IpcResponse<unknown[]>>
        setAssignees:   (taskId: number, userIds: number[]) => Promise<IpcResponse<null>>
        createDelivery: (data: unknown) => Promise<IpcResponse<{ id: number }>>
        getSummary:     () => Promise<IpcResponse<{
          total: number; pending: number; in_progress: number; done: number;
          overdue: number; due_today: number; deliveries_today: number
        }>>
      }
      notifications: {
        list:           (limit?: number) => Promise<IpcResponse<unknown[]>>
        getUnreadCount: () => Promise<IpcResponse<number>>
        markRead:       (id: number) => Promise<IpcResponse<null>>
        markAllRead:    () => Promise<IpcResponse<null>>
      }
    }
  }
}
