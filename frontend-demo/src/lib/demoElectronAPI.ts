/**
 * Demo-mode implementation of window.electronAPI using mock data.
 * All methods return { success, data } or { success: false, error, code }.
 */

import { mockDatabase, saveData } from './mockData'

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms))

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}
function err(message: string, code = 'ERR_UNKNOWN'): { success: false; error: string; code: string } {
  return { success: false, error: message, code }
}

// Map role to permissions (subset used by the app)
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['sales.view', 'sales.create', 'inventory.view', 'customers.view', 'repairs.view', 'reports.view', 'expenses.view', 'tasks.view', 'users.manage', 'settings.manage'],
  manager: ['sales.view', 'sales.create', 'inventory.view', 'customers.view', 'repairs.view', 'reports.view', 'expenses.view', 'tasks.view', 'settings.manage'],
  cashier: ['sales.view', 'sales.create', 'inventory.view', 'customers.view'],
  technician: ['repairs.view'],
}

let currentSession: { userId: number; username: string; fullName: string; role: string; permissions: string[]; id?: number } | null = null

function sessionFromUser(u: { id: number; username: string; name: string; role: string }) {
  return {
    userId: u.id,
    username: u.username,
    fullName: u.name,
    role: u.role,
    permissions: ROLE_PERMISSIONS[u.role] || [],
  }
}

function createDemoAPI(): typeof window.electronAPI {
  return {
    auth: {
      login: async (credentials: { username: string; password: string }) => {
        await delay()
        const u = mockDatabase.users.find(
          (x) => x.username === credentials.username || x.email === credentials.username
        )
        if (!u) return err('Invalid credentials', 'ERR_AUTH')
        const session = sessionFromUser(u)
        currentSession = { ...session, id: u.id }
        return ok(session)
      },
      logout: async () => {
        await delay()
        currentSession = null
        return ok(null)
      },
      getSession: async () => {
        await delay()
        return ok(currentSession)
      },
      changePassword: async () => ok(null),
    },

    settings: {
      getAll: async () => {
        await delay()
        return ok({ ...mockDatabase.settings })
      },
      get: async (key: string) => ok(mockDatabase.settings[key] ?? null),
      set: async (key: string, value: string) => {
        mockDatabase.settings[key] = value
        saveData()
        return ok(null)
      },
      setBulk: async (entries: Record<string, string>) => {
        Object.assign(mockDatabase.settings, entries)
        saveData()
        return ok(null)
      },
    },

    products: {
      list: async (_filters?: unknown) => {
        await delay()
        const raw = mockDatabase.products.length ? mockDatabase.products : mockDatabase.inventory.map((i) => ({
          id: i.id, name: i.name, sku: i.sku, quantity: i.quantity, selling_price: i.sellingPrice, cost_price: i.costPrice, category_id: null, barcode: null,
        }))
        const list = raw.map((p: Record<string, unknown>) => ({
          ...p,
          sell_price: p.selling_price ?? p.sell_price ?? 0,
          cost_price: p.cost_price ?? 0,
          stock_quantity: p.quantity ?? p.stock_quantity ?? 0,
          unit: p.unit ?? 'Piece',
          category_name: p.category_name ?? null,
          brand_name: p.brand_name ?? null,
        }))
        return ok({ rows: list, items: list, total: list.length })
      },
      getById: async (id: number) => {
        await delay()
        const p = mockDatabase.products.find((x: Record<string, unknown>) => x.id === id) ?? mockDatabase.inventory.find((x) => x.id === id)
        return p ? ok(p) : err('Not found', 'ERR_NOT_FOUND')
      },
      search: async () => {
        await delay()
        return ok([])
      },
      findByBarcode: async () => {
        await delay()
        return err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.products.map((p: Record<string, unknown>) => Number(p.id))) + 1
        mockDatabase.products.push({ ...(data as object), id })
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      adjustStock: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      getLowStock: async () => {
        await delay()
        const low = mockDatabase.inventory.filter((i) => i.quantity <= i.reorderLevel)
        return ok(low)
      },
    },

    categories: {
      list: async () => {
        await delay()
        return ok(mockDatabase.categories)
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.categories.map((c) => c.id)) + 1
        mockDatabase.categories.push({ id, name: (data as { name: string }).name })
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    brands: {
      list: async () => {
        await delay()
        return ok(mockDatabase.brands)
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.brands.map((b) => b.id)) + 1
        mockDatabase.brands.push({ id, name: (data as { name: string }).name })
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    suppliers: {
      list: async (filters?: unknown) => {
        await delay()
        const list = mockDatabase.suppliers.map((s) => ({ ...s, name: s.name || '' }))
        return ok({ rows: list, total: list.length })
      },
      getById: async (id: number) => {
        await delay()
        const s = mockDatabase.suppliers.find((x) => x.id === id)
        return s ? ok(s) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.suppliers.map((s) => s.id)) + 1
        mockDatabase.suppliers.push({ ...(data as object), id } as (typeof mockDatabase.suppliers)[0])
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    customers: {
      list: async (filters?: unknown) => {
        await delay()
        const f = filters as { search?: string; page?: number; pageSize?: number } | undefined
        let rows = [...mockDatabase.customers]
        if (f?.search) {
          const q = f.search.toLowerCase()
          rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
        }
        const pageSize = f?.pageSize ?? 50
        const page = f?.page ?? 1
        const total = rows.length
        const start = (page - 1) * pageSize
        const slice = rows.slice(start, start + pageSize)
        return ok({ rows: slice, items: slice, total, page, pageSize })
      },
      getById: async (id: number) => {
        await delay()
        const c = mockDatabase.customers.find((x) => x.id === id)
        return c ? ok(c) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.customers.map((c) => c.id)) + 1
        const rec = { ...(data as Record<string, unknown>), id, vehicleCount: 0, totalSpent: 0, createdAt: new Date().toISOString(), type: 'individual' }
        mockDatabase.customers.push(rec as (typeof mockDatabase.customers)[0])
        saveData()
        return ok(rec)
      },
      update: async (id: number, data: unknown) => {
        await delay()
        const i = mockDatabase.customers.findIndex((x) => x.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.customers[i] = { ...mockDatabase.customers[i], ...(data as object) } as (typeof mockDatabase.customers)[0]
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      search: async (query: string) => {
        await delay()
        const q = query.toLowerCase()
        const rows = mockDatabase.customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
        return ok(rows)
      },
    },

    sales: {
      list: async (filters?: unknown) => {
        await delay()
        return ok({ rows: mockDatabase.sales, total: mockDatabase.sales.length })
      },
      getById: async (id: number) => {
        await delay()
        const s = mockDatabase.sales.find((x: Record<string, unknown>) => x.id === id)
        return s ? ok(s) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.sales.map((x: Record<string, unknown>) => Number(x.id))) + 1
        mockDatabase.sales.push({ ...(data as object), id } as Record<string, unknown>)
        saveData()
        return ok({ id })
      },
      void: async () => {
        await delay()
        return ok(null)
      },
      saveDraft: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.salesDrafts.map((x: Record<string, unknown>) => Number(x.id))) + 1
        mockDatabase.salesDrafts.push({ ...(data as object), id } as Record<string, unknown>)
        saveData()
        return ok({ id })
      },
      getDrafts: async () => {
        await delay()
        return ok(mockDatabase.salesDrafts)
      },
      getDraftById: async (id: number) => {
        await delay()
        const d = mockDatabase.salesDrafts.find((x: Record<string, unknown>) => x.id === id)
        return d ? ok(d) : err('Not found', 'ERR_NOT_FOUND')
      },
      deleteDraft: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      addPayment: async () => ok(null),
    },

    payments: { addPayment: async () => ok(null), getForSale: async () => ok([]) },

    invoices: {
      getForSale: async () => ok(null),
      generatePdf: async () => ok(''),
      print: async () => ok(null),
      openPdf: async () => ok(null),
    },

    repairs: {
      list: async (filters?: unknown) => {
        await delay()
        const list = mockDatabase.jobCards.map((j) => ({ ...j, job_number: j.jobNumber, vehicle_id: j.vehicleId, owner_id: j.ownerId }))
        return ok(list)
      },
      getByStatus: async () => {
        await delay()
        const customers = new Map(mockDatabase.customers.map((c) => [c.id, c]))
        const vehicles = new Map(mockDatabase.vehicles.map((v) => [v.id, v]))
        const users = new Map(mockDatabase.users.map((u) => [u.id, u]))
        const rows = mockDatabase.jobCards.map((j) => {
          const owner = customers.get(j.ownerId)
          const vehicle = vehicles.get(j.vehicleId)
          const tech = users.get(j.technicianId ?? 0)
          return {
            ...j,
            job_number: j.jobNumber,
            vehicle_id: j.vehicleId,
            owner_id: j.ownerId,
            owner_name: owner?.name,
            owner_phone: owner?.phone,
            technician_name: tech?.name,
            vehicle_make: vehicle?.make,
            vehicle_model: vehicle?.model,
            vehicle_year: vehicle?.year,
            vehicle_plate: vehicle?.plateNumber,
          }
        })
        return ok(rows)
      },
      getById: async (id: number) => {
        await delay()
        const j = mockDatabase.jobCards.find((x) => x.id === id)
        if (!j) return err('Not found', 'ERR_NOT_FOUND')
        const owner = mockDatabase.customers.find((c) => c.id === j.ownerId)
        const vehicle = mockDatabase.vehicles.find((v) => v.id === j.vehicleId)
        return ok({
          ...j,
          job_number: j.jobNumber,
          vehicle_id: j.vehicleId,
          owner_id: j.ownerId,
          owner_name: owner?.name,
          vehicle_make: vehicle?.make,
          vehicle_model: vehicle?.model,
          vehicle_year: vehicle?.year,
          vehicle_plate: vehicle?.plateNumber,
        })
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.jobCards.map((j) => j.id)) + 1
        const jn = `JOB-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`
        mockDatabase.jobCards.push({ ...(data as Record<string, unknown>), id, jobNumber: jn, createdAt: new Date().toISOString() } as (typeof mockDatabase.jobCards)[0])
        saveData()
        return ok({ id, job_number: jn })
      },
      update: async (id: number, data: unknown) => {
        await delay()
        const i = mockDatabase.jobCards.findIndex((j) => j.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.jobCards[i] = { ...mockDatabase.jobCards[i], ...(data as object) } as (typeof mockDatabase.jobCards)[0]
        saveData()
        return ok(null)
      },
      updateStatus: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    reports: {
      salesDaily: async () => {
        await delay()
        const sales = mockDatabase.sales ?? []
        const rows = sales.map((s: Record<string, unknown>) => ({
          created_at: (s.created_at as string) ?? new Date().toISOString().slice(0, 10),
          total_amount: (s.total_amount as number) ?? (s.total as number) ?? 0,
        }))
        return ok(rows)
      },
      salesMonthly: async () => {
        await delay()
        return ok([])
      },
      profit: async (_from?: string, _to?: string) => {
        await delay()
        return ok([])
      },
      topProducts: async () => {
        await delay()
        return ok([])
      },
      inventory: async () => {
        await delay()
        return ok(mockDatabase.inventory)
      },
      lowStock: async () => {
        await delay()
        return ok(mockDatabase.inventory.filter((i) => i.quantity <= i.reorderLevel))
      },
      customerDebts: async () => {
        await delay()
        return ok([])
      },
      exportCsv: async () => ok(''),
    },

    dashboard: {
      getSummary: async () => {
        await delay()
        const vehiclesInGarage = mockDatabase.jobCards.filter((j) => ['pending', 'in_progress', 'waiting_parts'].includes(j.status)).length
        const readyForPickup = mockDatabase.jobCards.filter((j) => j.status === 'ready').length
        const totalVehicles = mockDatabase.vehicles.length
        const activeJobCards = mockDatabase.jobCards.filter((j) => j.status !== 'delivered').length
        const monthRevenue = mockDatabase.jobCards.reduce((s, j) => s + (j.total ?? 0), 0)
        const monthExpenses = mockDatabase.expenses.reduce((s, e) => s + e.amount, 0)
        const lowStockParts = mockDatabase.inventory.filter((i) => i.quantity <= i.reorderLevel).length
        return ok({
          totalVehicles,
          vehiclesInGarage,
          readyForPickup,
          activeJobCards,
          monthRevenue,
          monthExpenses,
          monthProfit: monthRevenue - monthExpenses,
          lowStockParts,
          urgentJobCards: [],
        })
      },
    },

    users: {
      list: async () => {
        await delay()
        const list = mockDatabase.users.map((u) => ({
          id: u.id,
          username: u.username,
          full_name: u.name,
          role: u.role,
          is_active: u.isActive ? 1 : 0,
          created_at: u.createdAt,
          override_count: 0,
        }))
        return ok({ rows: list })
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.users.map((u) => u.id)) + 1
        const d = data as { username: string; full_name: string; role: string }
        mockDatabase.users.push({ id, username: d.username, name: d.full_name, email: '', role: d.role, isActive: true, createdAt: new Date().toISOString() } as (typeof mockDatabase.users)[0])
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      resetPassword: async () => ok(null),
      setPermissions: async () => ok(null),
      getAllPermissions: async () => ok([]),
      getUserPermissions: async () => ok([]),
      getRoleDefaults: async (role: string) => ok(ROLE_PERMISSIONS[role] ?? []),
      getUserOverrides: async () => ok([]),
      setOverride: async () => ok(null),
      removeOverride: async () => ok(null),
    },

    backup: {
      create: async () => ok(null),
      restore: async () => ok({ success: true }),
      selectFile: async () => ok(null),
      getSettings: async () => ok({ enabled: false, frequency: 'daily', backup_location: null, retention_count: 5, last_backup_at: null }),
      updateSettings: async () => ok(null),
      runNow: async () => ok({ success: true, message: 'Demo mode' }),
      chooseFolder: async () => ok(null),
      openFolder: async () => ok(null),
    },

    license: {
      check: async () => ok({ valid: true }),
      activate: async () => ok({ success: true }),
      getStatus: async () => ok({ activated: true, tier: 'PREMIUM' }),
      getHwId: async () => ok('demo-hw-id'),
      getInfo: async () => ok({ tier: 'PREMIUM', features: [], maxUsers: 10 }),
      hasFeature: async () => ok(true),
      getTier: async () => ok('PREMIUM'),
      canAddUser: async () => ok(true),
    },

    partners: {
      list: async () => {
        await delay()
        return ok({ rows: mockDatabase.partners, total: mockDatabase.partners.length })
      },
      getById: async (id: number) => {
        await delay()
        const p = mockDatabase.partners.find((x) => (x as { id: number }).id === id)
        return p ? ok(p) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const d = data as Record<string, unknown>
        const id = Math.max(0, ...mockDatabase.partners.map((p: Record<string, unknown>) => Number(p.id))) + 1
        mockDatabase.partners.push({ ...d, id, name: String(d.name ?? 'Partner') } as (typeof mockDatabase.partners)[0])
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    activity: {
      list: async () => {
        await delay()
        return ok({ rows: mockDatabase.activity, total: mockDatabase.activity.length })
      },
    },

    expenseCategories: {
      list: async () => {
        await delay()
        return ok(mockDatabase.expenseCategories)
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.expenseCategories.map((c) => c.id)) + 1
        mockDatabase.expenseCategories.push({ id, name: (data as { name: string }).name })
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    expenses: {
      list: async (filters?: unknown) => {
        await delay()
        const rows = mockDatabase.expenses
        return ok({ rows, total: rows.length })
      },
      getById: async (id: number) => {
        await delay()
        const e = mockDatabase.expenses.find((x) => x.id === id)
        return e ? ok(e) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.expenses.map((e) => e.id)) + 1
        mockDatabase.expenses.push({ ...(data as Record<string, unknown>), id, createdBy: currentSession?.userId ?? 1 } as (typeof mockDatabase.expenses)[0])
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      selectReceipt: async () => ok(null),
      openReceipt: async () => ok(null),
      sumByCategory: async () => ok([]),
      sumByMonth: async () => ok([]),
    },

    vehicles: {
      list: async (filters?: unknown) => {
        await delay()
        const f = filters as { search?: string; page?: number; pageSize?: number } | undefined
        let rows = [...mockDatabase.vehicles]
        if (f?.search) {
          const q = f.search.toLowerCase()
          rows = rows.filter((v) => v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.plateNumber.toLowerCase().includes(q))
        }
        const pageSize = f?.pageSize ?? 50
        const page = f?.page ?? 1
        const total = rows.length
        const start = (page - 1) * pageSize
        const customerMap = new Map(mockDatabase.customers.map((c) => [c.id, c.name]))
        const slice = rows.slice(start, start + pageSize).map((v) => ({
          ...v,
          license_plate: v.plateNumber,
          owner_id: v.ownerId,
          owner_name: customerMap.get(v.ownerId) ?? null,
          vin: v.vin ?? null,
          year: v.year,
          mileage: v.mileage,
          engine_type: null,
          transmission: null,
          insurance_company: v.insurance?.company ?? null,
          insurance_expiry: v.insurance?.expiryDate ?? null,
        }))
        return ok({ rows: slice, items: slice, total, page, pageSize })
      },
      getById: async (id: number) => {
        await delay()
        const v = mockDatabase.vehicles.find((x) => x.id === id)
        if (!v) return err('Not found', 'ERR_NOT_FOUND')
        return ok({ ...v, license_plate: v.plateNumber })
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.vehicles.map((v) => v.id)) + 1
        const d = data as Record<string, unknown>
        mockDatabase.vehicles.push({ ...d, id, createdAt: new Date().toISOString(), plateNumber: d.license_plate ?? d.plateNumber } as (typeof mockDatabase.vehicles)[0])
        saveData()
        return ok({ id })
      },
      update: async (id: number, data: unknown) => {
        await delay()
        const i = mockDatabase.vehicles.findIndex((v) => v.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.vehicles[i] = { ...mockDatabase.vehicles[i], ...(data as object) } as (typeof mockDatabase.vehicles)[0]
        saveData()
        return ok(null)
      },
      delete: async (id: number) => {
        const i = mockDatabase.vehicles.findIndex((v) => v.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.vehicles.splice(i, 1)
        saveData()
        return ok(null)
      },
      getByOwner: async (ownerId: number) => {
        await delay()
        const rows = mockDatabase.vehicles.filter((v) => v.ownerId === ownerId)
        return ok(rows)
      },
    },

    jobCards: {
      list: async (filters?: unknown) => {
        await delay()
        let rows = mockDatabase.jobCards.map((j) => ({ ...j, job_number: j.jobNumber, vehicle_id: j.vehicleId, owner_id: j.ownerId }))
        const f = filters as { status?: string } | undefined
        if (f?.status) rows = rows.filter((j) => j.status === f.status)
        return ok(rows)
      },
      getByStatus: async () => {
        await delay()
        const customers = new Map(mockDatabase.customers.map((c) => [c.id, c]))
        const vehicles = new Map(mockDatabase.vehicles.map((v) => [v.id, v]))
        const users = new Map(mockDatabase.users.map((u) => [u.id, u]))
        return ok(
          mockDatabase.jobCards.map((j) => {
            const owner = customers.get(j.ownerId)
            const vehicle = vehicles.get(j.vehicleId)
            const tech = users.get(j.technicianId ?? 0)
            return {
              ...j,
              job_number: j.jobNumber,
              vehicle_id: j.vehicleId,
              owner_id: j.ownerId,
              owner_name: owner?.name,
              owner_phone: owner?.phone,
              technician_name: tech?.name,
              vehicle_make: vehicle?.make,
              vehicle_model: vehicle?.model,
              vehicle_year: vehicle?.year,
              vehicle_plate: vehicle?.plateNumber,
            }
          })
        )
      },
      getById: async (id: number) => {
        await delay()
        const j = mockDatabase.jobCards.find((x) => x.id === id)
        if (!j) return err('Not found', 'ERR_NOT_FOUND')
        return ok({ ...j, job_number: j.jobNumber, vehicle_id: j.vehicleId, owner_id: j.ownerId })
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.jobCards.map((j) => j.id)) + 1
        const jn = `JOB-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`
        const payload = data as Record<string, unknown>
        mockDatabase.jobCards.push({
          id,
          jobNumber: jn,
          vehicleId: (payload.vehicle_id ?? payload.vehicleId) as number,
          ownerId: (payload.owner_id ?? payload.ownerId) as number,
          status: (payload.status as string) ?? 'pending',
          priority: (payload.priority as string) ?? 'normal',
          jobType: (payload.job_type as string) ?? 'General',
          createdAt: new Date().toISOString(),
          ...payload,
        } as (typeof mockDatabase.jobCards)[0])
        saveData()
        return ok({ id, job_number: jn })
      },
      update: async (id: number, data: unknown) => {
        await delay()
        const i = mockDatabase.jobCards.findIndex((j) => j.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.jobCards[i] = { ...mockDatabase.jobCards[i], ...(data as object) } as (typeof mockDatabase.jobCards)[0]
        saveData()
        return ok(null)
      },
      updateStatus: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      addPart: async () => {
        await delay()
        return ok(null)
      },
      removePart: async () => {
        await delay()
        return ok(null)
      },
      getForVehicle: async (vehicleId: number) => {
        await delay()
        const rows = mockDatabase.jobCards.filter((j) => j.vehicleId === vehicleId)
        return ok(rows.map((j) => ({ ...j, job_number: j.jobNumber })))
      },
    },

    services: {
      list: async (_filters?: unknown) => {
        await delay()
        return ok({ items: mockDatabase.services as unknown[] })
      },
      getById: async (id: number) => {
        await delay()
        const s = mockDatabase.services.find((x: Record<string, unknown>) => x.id === id)
        return s ? ok(s) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.services.map((s: Record<string, unknown>) => Number(s.id))) + 1
        mockDatabase.services.push({ ...(data as object), id })
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      getCategories: async () => ok([]),
    },

    jobTypes: {
      listAll: async () => {
        await delay()
        if (mockDatabase.jobTypes.length === 0) {
          mockDatabase.jobTypes = [
            { id: 1, name: 'General Service', description: '', is_active: 1, sort_order: 1 },
            { id: 2, name: 'Oil Change', description: '', is_active: 1, sort_order: 2 },
            { id: 3, name: 'Engine Repair', description: '', is_active: 1, sort_order: 3 },
          ]
          saveData()
        }
        return ok(mockDatabase.jobTypes)
      },
      listActive: async () => {
        await delay()
        if (mockDatabase.jobTypes.length === 0) {
          mockDatabase.jobTypes = [
            { id: 1, name: 'General Service', description: '', is_active: 1, sort_order: 1 },
            { id: 2, name: 'Oil Change', description: '', is_active: 1, sort_order: 2 },
            { id: 3, name: 'Engine Repair', description: '', is_active: 1, sort_order: 3 },
          ]
          saveData()
        }
        return ok(mockDatabase.jobTypes.filter((j) => j.is_active !== 0))
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.jobTypes.map((j) => j.id)) + 1
        mockDatabase.jobTypes.push({ id, ...(data as object), is_active: 1, sort_order: id } as (typeof mockDatabase.jobTypes)[0])
        saveData()
        return ok({ id })
      },
      update: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
      reorder: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    customReceipts: {
      list: async (filters?: unknown) => {
        await delay()
        return ok({ rows: mockDatabase.customReceipts, total: mockDatabase.customReceipts.length })
      },
      getById: async (id: number) => {
        await delay()
        const r = mockDatabase.customReceipts.find((x: Record<string, unknown>) => x.id === id)
        return r ? ok(r) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.customReceipts.map((r: Record<string, unknown>) => Number(r.id))) + 1
        const year = new Date().getFullYear()
        const num = String(id).padStart(4, '0')
        const receipt_number = `CR-${year}-${num}`
        mockDatabase.customReceipts.push({ ...(data as object), id, receipt_number, created_at: new Date().toISOString() } as Record<string, unknown>)
        saveData()
        return ok({ id, receipt_number })
      },
      delete: async () => {
        await delay()
        saveData()
        return ok(null)
      },
    },

    employees: {
      list: async (filters?: unknown) => {
        await delay()
        return ok(mockDatabase.employees.map((e: Record<string, unknown>) => ({ ...e, document_count: 0, vacation_count: 0 })))
      },
      getById: async (id: number) => {
        await delay()
        const e = mockDatabase.employees.find((emp: Record<string, unknown>) => emp.id === id)
        return e ? ok(e) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async () => {
        await delay()
        return ok(null)
      },
      update: async () => {
        await delay()
        return ok(null)
      },
      delete: async () => {
        await delay()
        return ok(null)
      },
      listVacations: async () => ok([]),
      addVacation: async () => ok(null),
      endVacation: async () => ok(null),
      deleteVacation: async () => ok(null),
      listDocuments: async () => ok([]),
      uploadDocument: async () => err('Not available in demo', 'ERR_DEMO'),
      openDocument: async () => ok(null),
      deleteDocument: async () => ok(null),
      chooseFile: async () => ok(null),
    },

    app: {
      licenseActivated: () => {},
    },

    tasks: {
      list: async (filters?: unknown) => {
        await delay()
        const rows = mockDatabase.tasks
        return ok({ rows, total: rows.length, page: 1, pageSize: 50 })
      },
      getById: async (id: number) => {
        await delay()
        const t = mockDatabase.tasks.find((x) => x.id === id)
        return t ? ok(t) : err('Not found', 'ERR_NOT_FOUND')
      },
      create: async (data: unknown) => {
        await delay()
        const id = Math.max(0, ...mockDatabase.tasks.map((t) => t.id)) + 1
        mockDatabase.tasks.push({ ...(data as Record<string, unknown>), id, createdBy: currentSession?.userId ?? 1, createdAt: new Date().toISOString() } as (typeof mockDatabase.tasks)[0])
        saveData()
        return ok({ id })
      },
      update: async (id: number, data: unknown) => {
        await delay()
        const i = mockDatabase.tasks.findIndex((t) => t.id === id)
        if (i === -1) return err('Not found', 'ERR_NOT_FOUND')
        mockDatabase.tasks[i] = { ...mockDatabase.tasks[i], ...(data as object) } as (typeof mockDatabase.tasks)[0]
        saveData()
        return ok(null)
      },
      delete: async (id: number) => {
        const i = mockDatabase.tasks.findIndex((t) => t.id === id)
        if (i !== -1) {
          mockDatabase.tasks.splice(i, 1)
          saveData()
        }
        return ok(null)
      },
      getForCalendar: async (dateFrom: string, dateTo: string) => {
        await delay()
        const rows = mockDatabase.tasks.filter((t) => t.dueDate >= dateFrom && t.dueDate <= dateTo)
        return ok(rows.map((t) => ({ ...t, taskId: t.id, title: t.title, start: t.dueDate, end: t.dueDate })))
      },
      setAssignees: async () => ok(null),
      createDelivery: async (data: unknown) => {
        await delay()
        return ok({ id: 1 })
      },
      getSummary: async () => {
        await delay()
        const rows = mockDatabase.tasks
        return ok({
          total: rows.length,
          pending: rows.filter((t) => t.status === 'pending').length,
          in_progress: rows.filter((t) => t.status === 'in_progress').length,
          done: rows.filter((t) => t.status === 'done').length,
          overdue: 0,
          due_today: 0,
          deliveries_today: 0,
        })
      },
    },

    notifications: {
      list: async (limit?: number) => {
        await delay()
        return ok(mockDatabase.notifications.slice(0, limit ?? 20))
      },
      getUnreadCount: async () => ok(0),
      markRead: async () => ok(null),
      markAllRead: async () => ok(null),
    },
  }
}

export function installDemoElectronAPI(): void {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = createDemoAPI()
}
