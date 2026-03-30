import { getDb } from '../index'
import { expenseRepo } from './expenseRepo'
import { assetRepo } from './assetRepo'

export type ReportDepartmentFilter = 'all' | 'mechanical' | 'programming'

function invoiceDeptPredicate(dept: ReportDepartmentFilter, invoiceAlias = 'i'): string {
  if (dept === 'all') return '1=1'
  if (dept === 'mechanical') {
    return `COALESCE(${invoiceAlias}.department, 'mechanical') IN ('mechanical','both')`
  }
  return `COALESCE(${invoiceAlias}.department, 'mechanical') IN ('programming','both')`
}

export const reportRepo = {
  dashboard() {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    const todaySalesRow = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue
      FROM sales WHERE date(created_at) = ? AND status != 'voided'
    `).get(today) as { count: number; revenue: number }

    const monthRevenueRow = db.prepare(`
      SELECT COALESCE(SUM(total_amount),0) as revenue
      FROM sales WHERE date(created_at) >= ? AND status != 'voided'
    `).get(monthStart) as { revenue: number }

    const activeRepairs = (db.prepare(`
      SELECT COUNT(*) as cnt FROM repairs WHERE status NOT IN ('delivered','cancelled','completed')
    `).get() as { cnt: number }).cnt

    const lowStock = (db.prepare(`
      SELECT COUNT(*) as cnt FROM products WHERE stock_quantity <= low_stock_threshold AND is_active = 1
    `).get() as { cnt: number }).cnt

    // Garage-specific metrics (safe — tables may not exist in older DBs)
    let totalVehicles = 0,
      vehiclesInGarage = 0,
      vehiclesInGarageMechanical = 0,
      vehiclesInGarageProgramming = 0,
      readyForPickup = 0,
      readyForPickupMechanical = 0,
      readyForPickupProgramming = 0,
      activeJobCards = 0,
      activeJobCardsMechanical = 0,
      activeJobCardsProgramming = 0
    try {
      totalVehicles = (db.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number }).cnt
      vehiclesInGarage = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status IN ('pending','in_progress','waiting_parts')`
      ).get() as { cnt: number }).cnt
      vehiclesInGarageMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('pending','in_progress','waiting_parts')
           AND department IN ('mechanical','both')`
      ).get() as { cnt: number }).cnt
      vehiclesInGarageProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('pending','in_progress','waiting_parts')
           AND department IN ('programming','both')`
      ).get() as { cnt: number }).cnt
      readyForPickup = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status = 'ready'`
      ).get() as { cnt: number }).cnt
      readyForPickupMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status = 'ready' AND department IN ('mechanical','both')`
      ).get() as { cnt: number }).cnt
      readyForPickupProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status = 'ready' AND department IN ('programming','both')`
      ).get() as { cnt: number }).cnt
      activeJobCards = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status NOT IN ('delivered','cancelled')`
      ).get() as { cnt: number }).cnt
      activeJobCardsMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status NOT IN ('delivered','cancelled') AND department IN ('mechanical','both')`
      ).get() as { cnt: number }).cnt
      activeJobCardsProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status NOT IN ('delivered','cancelled') AND department IN ('programming','both')`
      ).get() as { cnt: number }).cnt
    } catch { /* tables not ready yet */ }

    // 7-day sales trend
    const salesTrend = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as count
      FROM sales
      WHERE date(created_at) >= date('now', '-6 days') AND status != 'voided'
      GROUP BY day ORDER BY day
    `).all()

    // Top 5 products today (by qty sold)
    const topProducts = db.prepare(`
      SELECT si.product_name, SUM(si.quantity) as total_qty, SUM(si.line_total) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) = ? AND s.status != 'voided'
      GROUP BY si.product_name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all(today)

    // Urgent/high job cards (safe — columns may not exist yet)
    let urgentJobCards: unknown[] = []
    try {
      urgentJobCards = db.prepare(`
        SELECT j.job_number, j.priority, j.status, j.job_type, j.bay_number,
               c.name as owner_name,
               v.make as vehicle_make, v.model as vehicle_model, v.year as vehicle_year,
               v.license_plate as vehicle_plate
        FROM job_cards j
        LEFT JOIN customers c ON j.owner_id = c.id
        LEFT JOIN vehicles v ON j.vehicle_id = v.id
        WHERE j.priority IN ('urgent','high') AND j.status NOT IN ('delivered','cancelled')
        ORDER BY CASE j.priority WHEN 'urgent' THEN 0 ELSE 1 END, j.created_at
        LIMIT 5
      `).all()
    } catch { /* columns not migrated yet */ }

    // Month gross profit (revenue - COGS)
    const monthCogsRow = db.prepare(`
      SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) as cogs
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) >= ? AND s.status != 'voided'
    `).get(monthStart) as { cogs: number }

    const monthExpenses = expenseRepo.monthTotal(monthStart)
    const monthGrossProfit = monthRevenueRow.revenue - monthCogsRow.cogs
    const monthNetProfit   = monthGrossProfit - monthExpenses
    const totalAssetsPurchase = assetRepo.totalPurchaseValue()

    return {
      todaySalesCount: todaySalesRow.count,
      todayRevenue: todaySalesRow.revenue,
      monthRevenue: monthRevenueRow.revenue,
      monthExpenses,
      monthGrossProfit,
      monthNetProfit,
      totalAssetsPurchase,
      activeRepairs,
      lowStock,
      salesTrend,
      topProducts,
      totalVehicles,
      vehiclesInGarage,
      vehiclesInGarageMechanical,
      vehiclesInGarageProgramming,
      readyForPickup,
      readyForPickupMechanical,
      readyForPickupProgramming,
      activeJobCards,
      activeJobCardsMechanical,
      activeJobCardsProgramming,
      urgentJobCards,
    }
  },

  /**
   * Cash vs non-cash receipts: POS `payments` (by method) + custom receipts (payment_method text).
   * Dates are inclusive on payment/receipt `created_at` (calendar day).
   */
  cashByMethodRange(dateFrom: string, dateTo: string): { cash: number; non_cash: number; total: number } {
    const db = getDb()
    const pos = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0) AS cash_sum,
        COALESCE(SUM(CASE WHEN p.method != 'cash' THEN p.amount ELSE 0 END), 0) AS non_cash_sum
      FROM payments p
      INNER JOIN sales s ON s.id = p.sale_id AND s.status != 'voided'
      WHERE date(p.created_at) BETWEEN date(?) AND date(?)
    `).get(dateFrom, dateTo) as { cash_sum: number; non_cash_sum: number }

    let custom = { cash_sum: 0, non_cash_sum: 0 }
    try {
      custom = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_method)) = 'cash' THEN amount ELSE 0 END), 0) AS cash_sum,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_method)) != 'cash' THEN amount ELSE 0 END), 0) AS non_cash_sum
        FROM custom_receipts
        WHERE date(created_at) BETWEEN date(?) AND date(?)
      `).get(dateFrom, dateTo) as { cash_sum: number; non_cash_sum: number }
    } catch {
      /* custom_receipts missing in older DBs */
    }

    const cash = (pos?.cash_sum ?? 0) + (custom?.cash_sum ?? 0)
    const nonCash = (pos?.non_cash_sum ?? 0) + (custom?.non_cash_sum ?? 0)
    return { cash, non_cash: nonCash, total: cash + nonCash }
  },

  salesDaily(dateFrom: string, dateTo: string, department: ReportDepartmentFilter = 'all') {
    const db = getDb()
    const deptPred = invoiceDeptPredicate(department, 'i')
    return db.prepare(`
      SELECT s.sale_number, i.invoice_number, s.total_amount, s.amount_paid, s.balance_due,
             s.status, s.created_at, c.name as customer_name, u.full_name as cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      WHERE date(s.created_at) BETWEEN date(?) AND date(?)
        AND s.status != 'voided'
        AND (${deptPred})
      ORDER BY s.created_at
    `).all(dateFrom, dateTo)
  },

  salesMonthly(year: number, month: number) {
    const db = getDb()
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return db.prepare(`
      SELECT date(created_at) as day,
             COUNT(*) as count,
             COALESCE(SUM(total_amount),0) as revenue,
             COALESCE(SUM(amount_paid),0) as collected,
             COALESCE(SUM(balance_due),0) as outstanding
      FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status != 'voided'
      GROUP BY day ORDER BY day
    `).all(prefix)
  },

  profit(dateFrom: string, dateTo: string, department: ReportDepartmentFilter = 'all') {
    const db = getDb()
    const deptPred = invoiceDeptPredicate(department, 'i')
    return db.prepare(`
      SELECT
        date(s.created_at) as day,
        COALESCE(SUM(s.total_amount),0) as revenue,
        COALESCE(SUM(si.cost_price * si.quantity),0) as cogs,
        COALESCE(SUM(s.total_amount),0) - COALESCE(SUM(si.cost_price * si.quantity),0) as gross_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status != 'voided'
        AND (${deptPred})
      GROUP BY day ORDER BY day
    `).all(dateFrom, dateTo)
  },

  inventory() {
    const db = getDb()
    return db.prepare(`
      SELECT p.name, p.sku, p.stock_quantity, p.low_stock_threshold, p.unit,
             p.cost_price, p.sell_price,
             COALESCE(c.name,'—') as category, COALESCE(b.name,'—') as brand,
             (p.stock_quantity * p.cost_price) as stock_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.is_active = 1
      ORDER BY p.name
    `).all()
  },

  lowStock() {
    const db = getDb()
    return db.prepare(`
      SELECT p.name, p.sku, p.stock_quantity, p.low_stock_threshold, p.unit,
             COALESCE(c.name,'—') as category, COALESCE(s.name,'—') as supplier
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.stock_quantity <= p.low_stock_threshold AND p.is_active = 1
      ORDER BY p.stock_quantity ASC
    `).all()
  },

  topProducts(dateFrom: string, dateTo: string, limit = 20) {
    const db = getDb()
    return db.prepare(`
      SELECT si.product_name, si.product_sku,
             SUM(si.quantity) as total_qty,
             SUM(si.line_total) as total_revenue,
             SUM(si.cost_price * si.quantity) as total_cost,
             SUM(si.line_total) - SUM(si.cost_price * si.quantity) as profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status != 'voided'
      GROUP BY si.product_name, si.product_sku
      ORDER BY total_qty DESC
      LIMIT ?
    `).all(dateFrom, dateTo, limit)
  },

  customerDebts(department: ReportDepartmentFilter = 'all') {
    const db = getDb()
    if (department === 'all') {
      return db.prepare(`
        SELECT c.id, c.name, c.phone, c.email, c.balance,
               COUNT(DISTINCT s.id) as sale_count,
               COALESCE(SUM(CASE WHEN s.status IN ('partial','completed') THEN s.balance_due ELSE 0 END),0) as total_due
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'voided'
        WHERE c.balance < 0
        GROUP BY c.id
        ORDER BY c.balance ASC
      `).all()
    }
    const deptPred = invoiceDeptPredicate(department, 'i')
    return db.prepare(`
      SELECT c.id, c.name, c.phone, c.email, c.balance,
             COUNT(DISTINCT s.id) as sale_count,
             COALESCE(SUM(CASE WHEN s.status IN ('partial','completed') THEN s.balance_due ELSE 0 END),0) as total_due
      FROM customers c
      INNER JOIN sales s ON s.customer_id = c.id AND s.status != 'voided'
      INNER JOIN invoices i ON i.sale_id = s.id
      WHERE (${deptPred})
      GROUP BY c.id
      HAVING SUM(CASE WHEN s.status IN ('partial','completed') THEN s.balance_due ELSE 0 END) > 0.005
      ORDER BY total_due DESC
    `).all()
  },
}
