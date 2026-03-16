/**
 * Mock Database - All data stored in memory, persisted to localStorage
 */

export interface MockUser {
  id: number
  name: string
  email: string
  username: string
  role: string
  isActive: boolean
  createdAt: string
}

export interface MockVehicle {
  id: number
  make: string
  model: string
  year: number
  vin: string
  plateNumber: string
  color: string
  mileage: number
  ownerId: number
  insurance?: { company: string; policyNumber: string; expiryDate: string }
  createdAt: string
}

export interface MockCustomer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  type: string
  vehicleCount: number
  totalSpent: number
  createdAt: string
}

export interface MockJobCard {
  id: number
  jobNumber: string
  vehicleId: number
  ownerId: number
  status: string
  priority: string
  jobType: string
  technicianId?: number
  bay?: string
  mileageIn?: number
  mileageOut?: number
  customerComplaint?: string
  diagnosis?: string
  workDone?: string
  laborHours?: number
  laborRate?: number
  partsTotal?: number
  taxRate?: number
  total?: number
  deposit?: number
  balanceDue?: number
  createdAt: string
}

export interface MockInventoryItem {
  id: number
  sku: string
  name: string
  category: string
  quantity: number
  unit: string
  costPrice: number
  sellingPrice: number
  reorderLevel: number
  supplier: string
  location: string
  createdAt: string
}

export interface MockExpense {
  id: number
  date: string
  category: string
  amount: number
  paymentMethod: string
  description: string
  vendor: string
  createdBy: number
}

export interface MockTask {
  id: number
  title: string
  description: string
  priority: string
  status: string
  dueDate: string
  assignedTo?: number
  createdBy: number
  createdAt: string
}

export interface MockInvoice {
  id: number
  invoiceNumber: string
  customerId: number
  date: string
  dueDate: string
  status: string
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  paidAmount: number
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>
}

const DEFAULT_SETTINGS: Record<string, string> = {
  'appearance.theme': 'system',
  'appearance.language': 'en',
  'app.name': 'Mahali Garage',
  'app.tagline': 'Auto Repair & Service',
}

export const mockDatabase = {
  settings: { ...DEFAULT_SETTINGS },

  users: [
    { id: 1, name: 'Demo Owner', email: 'owner@mahali.com', username: 'owner', role: 'owner', isActive: true, createdAt: new Date('2024-01-01').toISOString() },
    { id: 2, name: 'Demo Manager', email: 'manager@mahali.com', username: 'manager', role: 'manager', isActive: true, createdAt: new Date('2024-01-15').toISOString() },
  ] as MockUser[],

  vehicles: [
    { id: 1, make: 'Toyota', model: 'Camry', year: 2022, vin: 'JTD1234567890', plateNumber: 'DXB-12345', color: 'Silver', mileage: 45000, ownerId: 1, insurance: { company: 'Dubai Insurance', policyNumber: 'POL-123456', expiryDate: '2025-12-31' }, createdAt: new Date('2024-01-10').toISOString() },
    { id: 2, make: 'Honda', model: 'Civic', year: 2021, vin: 'JHM9876543210', plateNumber: 'AUH-67890', color: 'Black', mileage: 32000, ownerId: 2, insurance: { company: 'Abu Dhabi Insurance', policyNumber: 'POL-789012', expiryDate: '2025-06-30' }, createdAt: new Date('2024-02-01').toISOString() },
    { id: 3, make: 'Mercedes', model: 'C-Class', year: 2023, vin: 'WDD1234567890', plateNumber: 'SHJ-11111', color: 'White', mileage: 15000, ownerId: 1, createdAt: new Date('2024-03-01').toISOString() },
  ] as MockVehicle[],

  customers: [
    { id: 1, name: 'Ahmed Mohammed', phone: '+971 50 123 4567', email: 'ahmed@example.com', address: 'Dubai Marina, Dubai', type: 'individual', vehicleCount: 2, totalSpent: 4500, createdAt: new Date('2024-01-05').toISOString() },
    { id: 2, name: 'Sara Ali', phone: '+971 55 987 6543', email: 'sara@example.com', address: 'Al Reem Island, Abu Dhabi', type: 'individual', vehicleCount: 1, totalSpent: 2100, createdAt: new Date('2024-01-20').toISOString() },
    { id: 3, name: 'ABC Motors LLC', phone: '+971 4 123 4567', email: 'info@abcmotors.ae', address: 'Al Quoz, Dubai', type: 'company', vehicleCount: 15, totalSpent: 45000, createdAt: new Date('2024-02-10').toISOString() },
  ] as MockCustomer[],

  jobCards: [
    { id: 1, jobNumber: 'JOB-2024-0001', vehicleId: 1, ownerId: 1, status: 'in_progress', priority: 'high', jobType: 'Engine Repair', technicianId: 2, bay: 'Bay 1', mileageIn: 45000, customerComplaint: 'Engine making unusual noise', diagnosis: 'Timing belt needs replacement', workDone: 'Replacing timing belt and water pump', laborHours: 4, laborRate: 150, partsTotal: 800, taxRate: 5, total: 1440, deposit: 500, balanceDue: 940, createdAt: new Date('2024-03-10').toISOString() },
    { id: 2, jobNumber: 'JOB-2024-0002', vehicleId: 2, ownerId: 2, status: 'ready', priority: 'normal', jobType: 'Oil Change', technicianId: 2, bay: 'Bay 3', mileageIn: 32000, mileageOut: 32005, customerComplaint: 'Regular maintenance', diagnosis: 'Oil change due', workDone: 'Changed engine oil and filter', laborHours: 1, laborRate: 100, partsTotal: 120, taxRate: 5, total: 231, deposit: 0, balanceDue: 231, createdAt: new Date('2024-03-12').toISOString() },
  ] as MockJobCard[],

  inventory: [
    { id: 1, sku: 'OIL-5W30-001', name: 'Engine Oil 5W-30', category: 'Oils & Fluids', quantity: 45, unit: 'Liter', costPrice: 25, sellingPrice: 40, reorderLevel: 20, supplier: 'Gulf Oil', location: 'Shelf A1', createdAt: new Date('2024-01-01').toISOString() },
    { id: 2, sku: 'FILTER-OIL-002', name: 'Oil Filter', category: 'Filters', quantity: 8, unit: 'Piece', costPrice: 15, sellingPrice: 25, reorderLevel: 10, supplier: 'Mann Filter', location: 'Shelf B2', createdAt: new Date('2024-01-01').toISOString() },
    { id: 3, sku: 'BELT-TIMING-003', name: 'Timing Belt Kit', category: 'Engine Parts', quantity: 12, unit: 'Kit', costPrice: 250, sellingPrice: 400, reorderLevel: 5, supplier: 'Gates', location: 'Shelf C3', createdAt: new Date('2024-01-01').toISOString() },
  ] as MockInventoryItem[],

  expenses: [
    { id: 1, date: new Date('2024-03-01').toISOString(), category: 'Rent', amount: 15000, paymentMethod: 'bank_transfer', description: 'Monthly garage rent', vendor: 'Property Management', createdBy: 1 },
    { id: 2, date: new Date('2024-03-05').toISOString(), category: 'Utilities', amount: 2500, paymentMethod: 'cash', description: 'Electricity bill', vendor: 'DEWA', createdBy: 1 },
    { id: 3, date: new Date('2024-03-10').toISOString(), category: 'Supplies', amount: 3200, paymentMethod: 'card', description: 'Parts inventory restock', vendor: 'Auto Parts Supplier', createdBy: 1 },
  ] as MockExpense[],

  tasks: [
    { id: 1, title: 'Order brake pads', description: 'Low stock on brake pads, need to reorder', priority: 'high', status: 'pending', dueDate: new Date('2024-03-20').toISOString(), assignedTo: 2, createdBy: 1, createdAt: new Date('2024-03-15').toISOString() },
    { id: 2, title: 'Follow up with customer - Camry repair', description: 'Call Ahmed about Camry repair status', priority: 'normal', status: 'in_progress', dueDate: new Date('2024-03-17').toISOString(), assignedTo: 2, createdBy: 1, createdAt: new Date('2024-03-16').toISOString() },
  ] as MockTask[],

  invoices: [
    { id: 1, invoiceNumber: 'INV-2024-0001', customerId: 1, date: new Date('2024-03-01').toISOString(), dueDate: new Date('2024-03-15').toISOString(), status: 'paid', subtotal: 1200, taxRate: 5, taxAmount: 60, total: 1260, paidAmount: 1260, items: [{ description: 'Oil Change', quantity: 1, unitPrice: 200, total: 200 }, { description: 'Brake Pads Replacement', quantity: 1, unitPrice: 1000, total: 1000 }] },
  ] as MockInvoice[],

  categories: [] as Array<{ id: number; name: string }>,
  brands: [] as Array<{ id: number; name: string }>,
  suppliers: [] as Array<{ id: number; name: string; phone?: string; email?: string }>,
  partners: [] as Array<{ id: number; name: string; [k: string]: unknown }>,
  products: [] as Array<Record<string, unknown>>,
  sales: [] as Array<Record<string, unknown>>,
  salesDrafts: [] as Array<Record<string, unknown>>,
  expenseCategories: [] as Array<{ id: number; name: string }>,
  jobTypes: [] as Array<{ id: number; name: string; description?: string; is_active: number; sort_order: number }>,
  services: [] as Array<Record<string, unknown>>,
  customReceipts: [] as Array<Record<string, unknown>>,
  employees: [] as Array<Record<string, unknown>>,
  activity: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
}

const STORAGE_KEY = 'mahali_garage_demo_data'

function loadStored(): Partial<typeof mockDatabase> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<typeof mockDatabase>
  } catch {
    return null
  }
}

export function initMockData(): void {
  const stored = loadStored()
  if (stored) {
    if (stored.settings) Object.assign(mockDatabase.settings, stored.settings)
    if (stored.users?.length) mockDatabase.users = stored.users as MockUser[]
    if (stored.vehicles?.length) mockDatabase.vehicles = stored.vehicles as MockVehicle[]
    if (stored.customers?.length) mockDatabase.customers = stored.customers as MockCustomer[]
    if (stored.jobCards?.length) mockDatabase.jobCards = stored.jobCards as MockJobCard[]
    if (stored.inventory?.length) mockDatabase.inventory = stored.inventory as MockInventoryItem[]
    if (stored.expenses?.length) mockDatabase.expenses = stored.expenses as MockExpense[]
    if (stored.tasks?.length) mockDatabase.tasks = stored.tasks as MockTask[]
    if (stored.invoices?.length) mockDatabase.invoices = stored.invoices as MockInvoice[]
    if (stored.categories?.length) mockDatabase.categories = stored.categories as Array<{ id: number; name: string }>
    if (stored.brands?.length) mockDatabase.brands = stored.brands as Array<{ id: number; name: string }>
    if (stored.suppliers?.length) mockDatabase.suppliers = stored.suppliers as Array<{ id: number; name: string; phone?: string; email?: string }>
    if (stored.partners?.length) mockDatabase.partners = stored.partners as typeof mockDatabase.partners
    if (stored.products?.length) mockDatabase.products = stored.products
    if (stored.sales?.length) mockDatabase.sales = stored.sales
    if (stored.salesDrafts?.length) mockDatabase.salesDrafts = stored.salesDrafts
    if (stored.expenseCategories?.length) mockDatabase.expenseCategories = stored.expenseCategories as typeof mockDatabase.expenseCategories
    if (stored.jobTypes?.length) mockDatabase.jobTypes = stored.jobTypes as typeof mockDatabase.jobTypes
    if (stored.services?.length) mockDatabase.services = stored.services
    if (stored.customReceipts?.length) mockDatabase.customReceipts = stored.customReceipts
    if (stored.employees?.length) mockDatabase.employees = stored.employees
    if (stored.activity?.length) mockDatabase.activity = stored.activity
    if (stored.notifications?.length) mockDatabase.notifications = stored.notifications
  }
  saveData()
}

export function saveData(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockDatabase))
}

export function resetDemoData(): void {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}
