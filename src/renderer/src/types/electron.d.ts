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
        getAuthType: (username: string) => Promise<IpcResponse<'password' | 'passcode_4' | 'passcode_6' | null>>
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
      jobCards: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown>>
        getByStatus: () => Promise<IpcResponse<unknown[]>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<unknown>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        updateStatus: (id: number, status: string) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
        addPart: (jobCardId: number, part: unknown) => Promise<IpcResponse<unknown>>
        removePart: (partId: number) => Promise<IpcResponse<null>>
        getForVehicle: (vehicleId: number) => Promise<IpcResponse<unknown[]>>
      }
      cashDrawer: {
        summary: (filters?: { from?: string | null; to?: string | null }) => Promise<IpcResponse<{
          total_in: number
          total_out: number
          drawer_balance: number
          opening_total: number
          cash_sales_total: number
          other_in_total: number
        }>>
        list: (filters?: { from?: string | null; to?: string | null; limit?: number }) => Promise<IpcResponse<Array<{
          id: number
          business_date: string
          created_at: string
          direction: 'in' | 'out'
          amount: number
          entry_type: string
          note: string | null
          payment_id: number | null
        }>>>
        setOpening: (payload: { businessDate: string; amount: number }) => Promise<IpcResponse<null>>
        addManual: (payload: {
          direction: 'in' | 'out'
          amount: number
          entry_type: string
          note?: string | null
          business_date?: string
        }) => Promise<IpcResponse<{ id: number }>>
      }
      assets: {
        list: (filters?: unknown) => Promise<IpcResponse<{ rows: unknown[]; total: number; purchaseSumFiltered: number }>>
        categories: () => Promise<IpcResponse<string[]>>
        getById: (id: number) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<{ id: number }>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      reports: {
        salesDaily: (dateFrom: string, dateTo?: string, department?: string) => Promise<IpcResponse<unknown>>
        salesMonthly: (year: number, month: number) => Promise<IpcResponse<unknown>>
        profit: (from: string, to: string, department?: string) => Promise<IpcResponse<unknown>>
        departmentSummary: (from: string, to: string) => Promise<IpcResponse<unknown>>
        cashByMethod: (from: string, to?: string) => Promise<IpcResponse<{ cash: number; non_cash: number; total: number }>>
        topProducts: (from: string, to: string) => Promise<IpcResponse<unknown[]>>
        inventory: () => Promise<IpcResponse<unknown[]>>
        lowStock: () => Promise<IpcResponse<unknown[]>>
        customerDebts: (department?: string) => Promise<IpcResponse<unknown[]>>
        assets: () => Promise<IpcResponse<{
          rows: Array<{
            id: number
            name: string
            category: string
            purchase_date: string
            purchase_price: number
            current_value: number | null
            description: string | null
            notes: string | null
            created_at: string
          }>
          total_purchase: number
          total_current: number
        }>>
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
        setAuth: (id: number, data: { auth_type: 'password' | 'passcode_4' | 'passcode_6'; passcode?: string | null }) => Promise<IpcResponse<null>>
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
        sumByCategory: (from: string, to: string, department?: string)  => Promise<IpcResponse<unknown[]>>
        sumByMonth:    (year: number, department?: string)              => Promise<IpcResponse<unknown[]>>
      }
      license: {
        check: () => Promise<IpcResponse<unknown>>
        activate: (key: string) => Promise<IpcResponse<unknown>>
        getStatus: () => Promise<IpcResponse<unknown>>
        getHwId: () => Promise<IpcResponse<string>>
      }
      app: {
        licenseActivated: () => void
        getVersion: () => Promise<string>
        checkForUpdates: () => Promise<{
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
          }
        }>
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
      tv: {
        open: () => Promise<IpcResponse<{ success: boolean }>>
        close: () => Promise<IpcResponse<{ success: boolean }>>
        listDisplays: () => Promise<IpcResponse<Array<{
          index: number
          id: number
          label: string
          bounds: { x: number; y: number; width: number; height: number }
        }>>>
      }
      loyalty: {
        get: (customerId: number, department?: string) => Promise<IpcResponse<{
          id: number
          customer_id: number
          department: 'all' | 'mechanical' | 'programming'
          points: number
          stamps: number
          total_visits: number
          tier_level: number
          updated_at: string
        }>>
        getAllDepts: (customerId: number) => Promise<IpcResponse<Array<{
          id: number
          customer_id: number
          department: 'all' | 'mechanical' | 'programming'
          points: number
          stamps: number
          total_visits: number
          tier_level: number
          updated_at: string
        }>>>
        addTransaction: (data: {
          customer_id: number
          department?: 'all' | 'mechanical' | 'programming'
          type: 'earn_points' | 'earn_stamps' | 'redeem' | 'manual_adjust'
          points_delta: number
          stamps_delta: number
          visits_delta: number
          source?: 'invoice' | 'receipt' | 'manual'
          source_id?: number
          note?: string
          created_by?: number
        }) => Promise<IpcResponse<null>>
        getTransactions: (
          customerId: number,
          department?: string,
          limit?: number
        ) => Promise<IpcResponse<Array<{
          id: number
          customer_id: number
          department: string
          type: string
          points_delta: number
          stamps_delta: number
          visits_delta: number
          source: string | null
          source_id: number | null
          note: string | null
          created_by: number | null
          created_at: string
        }>>>
        processAutoEarn: (params: {
          customer_id: number
          amount: number
          source: 'invoice' | 'receipt'
          source_id: number
          created_by: number
          department?: 'mechanical' | 'programming'
        }) => Promise<IpcResponse<null>>
        redeemReward: (params: {
          customer_id: number
          department: 'all' | 'mechanical' | 'programming'
          note: string
          created_by: number
        }) => Promise<IpcResponse<null>>
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
      carBrands: {
        list: () => Promise<IpcResponse<unknown[]>>
        create: (data: unknown) => Promise<IpcResponse<{ id: number }>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      serviceCatalog: {
        list: (filters?: unknown) => Promise<IpcResponse<unknown[]>>
        forVehicle: (make: string, model: string) => Promise<IpcResponse<unknown>>
        create: (data: unknown) => Promise<IpcResponse<{ id: number }>>
        update: (id: number, data: unknown) => Promise<IpcResponse<null>>
        delete: (id: number) => Promise<IpcResponse<null>>
      }
      print: {
        receipt:              (html: string) => Promise<IpcResponse<boolean>>
        chooseDownloadFolder: ()             => Promise<IpcResponse<string | null>>
        listPrinters:         () => Promise<IpcResponse<Array<{
          name: string
          displayName: string
          isDefault: boolean
          status: number
        }>>>
        thermal:              (html: string, printerName: string) => Promise<IpcResponse<boolean>>
      }
      employees: {
        list:            (filters?: unknown) => Promise<IpcResponse<unknown[]>>
        getById:         (id: number) => Promise<IpcResponse<unknown>>
        create:          (data: unknown) => Promise<IpcResponse<unknown>>
        previewNextId:   () => Promise<IpcResponse<string>>
        update:          (id: number, data: unknown) => Promise<IpcResponse<unknown>>
        delete:          (id: number) => Promise<IpcResponse<unknown>>
        listVacations:   (employeeId: number) => Promise<IpcResponse<unknown[]>>
        addVacation:     (data: unknown) => Promise<IpcResponse<unknown>>
        endVacation:     (vacationId: number, actualReturnDate: string) => Promise<IpcResponse<unknown>>
        deleteVacation:  (vacationId: number) => Promise<IpcResponse<unknown>>
        listDocuments:   (employeeId: number) => Promise<IpcResponse<unknown[]>>
        uploadDocument:  (data: unknown) => Promise<IpcResponse<unknown>>
        openDocument:    (docId: number) => Promise<IpcResponse<unknown>>
        deleteDocument:  (docId: number) => Promise<IpcResponse<unknown>>
        chooseFile:      () => Promise<
          IpcResponse<{
            fileName: string
            fileBuffer: number[]
            mimeType: string
            fileSize: number
          } | null>
        >
        getSalary:       (employeeId: number) => Promise<IpcResponse<unknown>>
        upsertSalary:    (data: unknown) => Promise<IpcResponse<unknown>>
        listPayroll:     (filter?: 'all' | 'paid' | 'unpaid' | 'overdue') => Promise<IpcResponse<unknown[]>>
        markSalaryPaid:  (employeeId: number) => Promise<IpcResponse<{ expense_id: number; amount: number }>>
      }
      storeDocuments: {
        list: () => Promise<
          IpcResponse<
            Array<{
              id: number
              name: string
              doc_type: string
              file_path: string
              file_name: string
              has_expiry: number
              expiry_date: string | null
              notes: string | null
              uploaded_by: number | null
              created_at: string
              uploaded_by_name: string | null
            }>
          >
        >
        upload: (data: {
          name: string
          doc_type: string
          file_name: string
          file_data: string
          has_expiry: number
          expiry_date?: string
          notes?: string
        }) => Promise<IpcResponse<{ id: number; file_path: string }>>
        delete: (id: number) => Promise<IpcResponse<null>>
        openFile: (filePath: string) => Promise<IpcResponse<null>>
        showInFolder: (filePath: string) => Promise<IpcResponse<null>>
      }
      attendance: {
        getStatuses: () => Promise<
          IpcResponse<
            Array<{
              id: number
              name: string
              color: string
              emoji: string | null
              is_default: number
              is_paid: number
              counts_as_working: number
              sort_order: number
              created_by: number | null
              created_at: string
            }>
          >
        >
        createStatus: (data: {
          name: string
          color: string
          emoji?: string
          is_paid: number
          counts_as_working: number
        }) => Promise<IpcResponse<{ id: number }>>
        updateStatus: (
          id: number,
          data: Partial<{
            name: string
            color: string
            emoji?: string
            is_paid: number
            counts_as_working: number
          }>
        ) => Promise<IpcResponse<boolean>>
        deleteStatus: (id: number) => Promise<IpcResponse<boolean>>
        mark: (data: {
          employee_id: number
          date: string
          status_type_id: number
          department?: string
          notes?: string
        }) => Promise<IpcResponse<boolean>>
        bulkMark: (data: {
          employee_ids: number[]
          dates: string[]
          status_type_id: number
          department?: string
          notes?: string
          overwrite?: boolean
        }) => Promise<IpcResponse<{ marked: number; skipped: number }>>
        getMonthly: (
          employeeId: number,
          year: number,
          month: number
        ) => Promise<
          IpcResponse<
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
          >
        >
        getSummary: (
          employeeId: number,
          year: number,
          month: number
        ) => Promise<
          IpcResponse<{
            total_working_days: number
            present_days: number
            attendance_rate: number
            by_status: Array<{
              status_name: string
              status_color: string
              status_emoji: string
              count: number
            }>
          }>
        >
        getReport: (
          employeeId: number,
          from: string,
          to: string
        ) => Promise<
          IpcResponse<
            Array<{
              id: number
              date: string
              status_name: string
              status_color: string
              status_emoji: string
              notes: string | null
              marked_at: string
              marked_by_name: string | null
            }>
          >
        >
      }
    }
  }
}
