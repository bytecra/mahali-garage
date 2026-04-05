import { getDb } from '../index'
import { expenseRepo } from './expenseRepo'
import { assetRepo } from './assetRepo'
import { salaryRepo } from './salaryRepo'

export type ReportDepartmentFilter = 'all' | 'mechanical' | 'programming'

function invoiceDeptPredicate(dept: ReportDepartmentFilter, invoiceAlias = 'i'): string {
  if (dept === 'all') return '1=1'
  if (dept === 'mechanical') {
    return `COALESCE(${invoiceAlias}.department, 'mechanical') IN ('mechanical','both')`
  }
  return `COALESCE(${invoiceAlias}.department, 'mechanical') IN ('programming','both')`
}

function customReceiptDeptPredicate(dept: ReportDepartmentFilter, alias = 'cr'): string {
  if (dept === 'all') return '1=1'
  if (dept === 'mechanical') {
    return `COALESCE(json_array_length(CASE WHEN json_valid(${alias}.mechanical_services_json) THEN ${alias}.mechanical_services_json ELSE '[]' END), 0) > 0`
  }
  return `COALESCE(json_array_length(CASE WHEN json_valid(${alias}.programming_services_json) THEN ${alias}.programming_services_json ELSE '[]' END), 0) > 0`
}

export const reportRepo = {
  departmentSummary(dateFrom: string, dateTo: string) {
    const db = getDb()

    const customByDept = db.prepare(`
      WITH lines AS (
        SELECT
          'mechanical' as dept,
          date(cr.created_at) as d,
          CAST(json_extract(j.value, '$.sell_price') AS REAL) as sell_price,
          CAST(json_extract(j.value, '$.cost') AS REAL) as cost,
          TRIM(COALESCE(json_extract(j.value, '$.service_name'), '')) as service_name,
          cr.id as receipt_id
        FROM custom_receipts cr
        JOIN json_each(CASE WHEN json_valid(cr.mechanical_services_json) THEN cr.mechanical_services_json ELSE '[]' END) j
        WHERE cr.created_at BETWEEN ? AND ?
        UNION ALL
        SELECT
          'programming' as dept,
          date(cr.created_at) as d,
          CAST(json_extract(j.value, '$.sell_price') AS REAL) as sell_price,
          CAST(json_extract(j.value, '$.cost') AS REAL) as cost,
          TRIM(COALESCE(json_extract(j.value, '$.service_name'), '')) as service_name,
          cr.id as receipt_id
        FROM custom_receipts cr
        JOIN json_each(CASE WHEN json_valid(cr.programming_services_json) THEN cr.programming_services_json ELSE '[]' END) j
        WHERE cr.created_at BETWEEN ? AND ?
      )
      SELECT
        dept,
        COALESCE(SUM(CASE WHEN sell_price IS NOT NULL THEN sell_price ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN cost IS NOT NULL THEN cost ELSE 0 END), 0) as cost,
        COUNT(DISTINCT receipt_id) as receipts_count
      FROM lines
      GROUP BY dept
    `).all(dateFrom, dateTo, dateFrom, dateTo) as Array<{
      dept: 'mechanical' | 'programming'
      revenue: number
      cost: number
      receipts_count: number
    }>

    const jobsByDept = db.prepare(`
      SELECT
        dept,
        COUNT(*) as jobs_count,
        COALESCE(SUM(COALESCE(labor_total,0) + COALESCE(parts_total,0)),0) as jobs_revenue
      FROM (
        SELECT 'mechanical' as dept, labor_total, parts_total
        FROM job_cards
        WHERE created_at BETWEEN ? AND ?
          AND status != 'cancelled'
        UNION ALL
        SELECT 'programming' as dept, labor_total, parts_total
        FROM job_cards
        WHERE 1=0
      )
      GROUP BY dept
    `).all(dateFrom, dateTo) as Array<{
      dept: 'mechanical' | 'programming'
      jobs_count: number
      jobs_revenue: number
    }>

    const topServicesRaw = db.prepare(`
      SELECT dept, service_name, SUM(qty) as total_qty, SUM(revenue) as total_revenue
      FROM (
        SELECT
          'mechanical' as dept,
          TRIM(COALESCE(json_extract(j.value, '$.service_name'), '')) as service_name,
          1 as qty,
          CAST(json_extract(j.value, '$.sell_price') AS REAL) as revenue
        FROM custom_receipts cr
        JOIN json_each(CASE WHEN json_valid(cr.mechanical_services_json) THEN cr.mechanical_services_json ELSE '[]' END) j
        WHERE cr.created_at BETWEEN ? AND ?

        UNION ALL

        SELECT
          'programming' as dept,
          TRIM(COALESCE(json_extract(j.value, '$.service_name'), '')) as service_name,
          1 as qty,
          CAST(json_extract(j.value, '$.sell_price') AS REAL) as revenue
        FROM custom_receipts cr
        JOIN json_each(CASE WHEN json_valid(cr.programming_services_json) THEN cr.programming_services_json ELSE '[]' END) j
        WHERE cr.created_at BETWEEN ? AND ?

        UNION ALL

        SELECT
          'mechanical' as dept,
          TRIM(COALESCE(job_type, 'Job Card')) as service_name,
          1 as qty,
          COALESCE(labor_total,0) + COALESCE(parts_total,0) as revenue
        FROM job_cards
        WHERE created_at BETWEEN ? AND ?
          AND status != 'cancelled'

        UNION ALL

        SELECT
          'programming' as dept,
          TRIM(COALESCE(job_type, 'Job Card')) as service_name,
          1 as qty,
          COALESCE(labor_total,0) + COALESCE(parts_total,0) as revenue
        FROM job_cards
        WHERE 1=0
      )
      WHERE service_name != ''
      GROUP BY dept, service_name
      ORDER BY dept, total_qty DESC, total_revenue DESC
    `).all(
      dateFrom, dateTo,  // mechanical custom_receipts
      dateFrom, dateTo,  // programming custom_receipts
      dateFrom, dateTo,  // mechanical job_cards (programming branch uses WHERE 1=0, no params)
    ) as Array<{
      dept: 'mechanical' | 'programming'
      service_name: string
      total_qty: number
      total_revenue: number
    }>

    const byDept = {
      mechanical: { revenue: 0, cost: 0, gross_profit: 0, jobs_count: 0, top_services: [] as Array<{ service_name: string; total_qty: number; total_revenue: number }> },
      programming: { revenue: 0, cost: 0, gross_profit: 0, jobs_count: 0, top_services: [] as Array<{ service_name: string; total_qty: number; total_revenue: number }> },
    }

    for (const row of customByDept) {
      byDept[row.dept].revenue += row.revenue ?? 0
      byDept[row.dept].cost += row.cost ?? 0
      byDept[row.dept].jobs_count += row.receipts_count ?? 0
    }
    for (const row of jobsByDept) {
      byDept[row.dept].revenue += row.jobs_revenue ?? 0
      byDept[row.dept].jobs_count += row.jobs_count ?? 0
    }
    for (const row of topServicesRaw) {
      byDept[row.dept].top_services.push({
        service_name: row.service_name,
        total_qty: row.total_qty ?? 0,
        total_revenue: row.total_revenue ?? 0,
      })
    }

    byDept.mechanical.gross_profit = byDept.mechanical.revenue - byDept.mechanical.cost
    byDept.programming.gross_profit = byDept.programming.revenue - byDept.programming.cost
    byDept.mechanical.top_services = byDept.mechanical.top_services.slice(0, 5)
    byDept.programming.top_services = byDept.programming.top_services.slice(0, 5)

    return byDept
  },

  dashboard() {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    const todaySalesBase = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue
      FROM sales WHERE date(created_at) = ? AND status != 'voided'
    `).get(today) as { count: number; revenue: number }
    const todayCustom = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as revenue
      FROM custom_receipts WHERE date(created_at) = ?
    `).get(today) as { count: number; revenue: number }
    const todaySalesRow = {
      count: (todaySalesBase?.count ?? 0) + (todayCustom?.count ?? 0),
      revenue: (todaySalesBase?.revenue ?? 0) + (todayCustom?.revenue ?? 0),
    }

    const monthRevenueBase = db.prepare(`
      SELECT COALESCE(SUM(total_amount),0) as revenue
      FROM sales WHERE created_at >= ? AND status != 'voided'
    `).get(monthStart) as { revenue: number }
    const monthRevenueCustom = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as revenue
      FROM custom_receipts WHERE created_at >= ?
    `).get(monthStart) as { revenue: number }
    const monthRevenueRow = {
      revenue: (monthRevenueBase?.revenue ?? 0) + (monthRevenueCustom?.revenue ?? 0),
    }

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
      activeJobCardsProgramming = 0,
      todayDelivered = 0,
      todayDeliveredMechanical = 0,
      todayDeliveredProgramming = 0
    try {
      totalVehicles = (db.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number }).cnt
      vehiclesInGarage = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status IN ('pending','in_progress','waiting_parts','waiting_for_programming')`
      ).get() as { cnt: number }).cnt
      vehiclesInGarageMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('pending','in_progress','waiting_parts','waiting_for_programming')
           AND department IN ('mechanical','both')`
      ).get() as { cnt: number }).cnt
      vehiclesInGarageProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('pending','in_progress','waiting_parts','waiting_for_programming')
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
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status NOT IN ('delivered','completed_delivered','cancelled')`
      ).get() as { cnt: number }).cnt
      activeJobCardsMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status NOT IN ('delivered','completed_delivered','cancelled') AND department IN ('mechanical','both')`
      ).get() as { cnt: number }).cnt
      activeJobCardsProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status NOT IN ('delivered','completed_delivered','cancelled') AND department IN ('programming','both')`
      ).get() as { cnt: number }).cnt
      todayDelivered = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('delivered','completed_delivered')
           AND date(COALESCE(date_out, updated_at)) = ?`
      ).get(today) as { cnt: number }).cnt
    } catch { /* tables not ready yet */ }
    // dept breakdown for today's delivered — separate try so total still shows if dept column missing
    try {
      todayDeliveredMechanical = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('delivered','completed_delivered')
           AND date(COALESCE(date_out, updated_at)) = ?
           AND department IN ('mechanical','both')`
      ).get(today) as { cnt: number }).cnt
      todayDeliveredProgramming = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards
         WHERE status IN ('delivered','completed_delivered')
           AND date(COALESCE(date_out, updated_at)) = ?
           AND department IN ('programming','both')`
      ).get(today) as { cnt: number }).cnt
    } catch { /* department column not available */ }

    // 7-day sales trend
    const salesTrend = db.prepare(`
      SELECT day, COALESCE(SUM(revenue),0) as revenue, COALESCE(SUM(count),0) as count
      FROM (
        SELECT date(created_at) as day, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as count
        FROM sales
        WHERE date(created_at) >= date('now', '-6 days') AND status != 'voided'
        GROUP BY date(created_at)
        UNION ALL
        SELECT date(created_at) as day, COALESCE(SUM(amount),0) as revenue, COUNT(*) as count
        FROM custom_receipts
        WHERE date(created_at) >= date('now', '-6 days')
        GROUP BY date(created_at)
      )
      GROUP BY day
      ORDER BY day
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
    const monthCogsSales = db.prepare(`
      SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) as cogs
      FROM sale_items si JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at >= ? AND s.status != 'voided'
    `).get(monthStart) as { cogs: number }
    const monthCogsCustom = db.prepare(`
      SELECT COALESCE(SUM(
        COALESCE(
          (SELECT SUM(CAST(json_extract(j.value, '$.cost') AS REAL))
           FROM json_each(CASE WHEN json_valid(cr.mechanical_services_json) THEN cr.mechanical_services_json ELSE '[]' END) j),
          0
        ) +
        COALESCE(
          (SELECT SUM(CAST(json_extract(j2.value, '$.cost') AS REAL))
           FROM json_each(CASE WHEN json_valid(cr.programming_services_json) THEN cr.programming_services_json ELSE '[]' END) j2),
          0
        )
      ), 0) as cogs
      FROM custom_receipts cr
      WHERE cr.created_at >= ?
    `).get(monthStart) as { cogs: number }

    const monthExpenses = expenseRepo.monthTotal(monthStart)
    const monthCogs = (monthCogsSales?.cogs ?? 0) + (monthCogsCustom?.cogs ?? 0)
    const monthGrossProfit = monthRevenueRow.revenue - monthCogs
    const monthNetProfit   = monthGrossProfit - monthExpenses
    const totalAssetsPurchase = assetRepo.totalPurchaseValue()
    let unpaidSalariesTotal = 0
    try {
      unpaidSalariesTotal = salaryRepo.totalUnpaidDue()
    } catch { /* payroll tables missing */ }

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
      todayDelivered,
      todayDeliveredMechanical,
      todayDeliveredProgramming,
      urgentJobCards,
      unpaidSalariesTotal,
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
      WHERE p.created_at BETWEEN ? AND ?
    `).get(dateFrom, dateTo) as { cash_sum: number; non_cash_sum: number }

    let custom = { cash_sum: 0, non_cash_sum: 0 }
    try {
      custom = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_method)) = 'cash' THEN amount ELSE 0 END), 0) AS cash_sum,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(payment_method)) != 'cash' THEN amount ELSE 0 END), 0) AS non_cash_sum
        FROM custom_receipts
        WHERE created_at BETWEEN ? AND ?
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
    const customDeptPred = customReceiptDeptPredicate(department, 'cr')
    return db.prepare(`
      SELECT * FROM (
        SELECT s.sale_number, i.invoice_number, s.total_amount, s.amount_paid, s.balance_due,
               s.status, s.created_at, c.name as customer_name, u.full_name as cashier_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN invoices i ON i.sale_id = s.id
        WHERE s.created_at BETWEEN ? AND ?
          AND s.status != 'voided'
          AND (${deptPred})

        UNION ALL

        SELECT
          cr.receipt_number as sale_number,
          cr.receipt_number as invoice_number,
          cr.amount as total_amount,
          cr.amount as amount_paid,
          0 as balance_due,
          'completed' as status,
          cr.created_at,
          cr.customer_name as customer_name,
          u.full_name as cashier_name
        FROM custom_receipts cr
        LEFT JOIN users u ON u.id = cr.created_by
        WHERE cr.created_at BETWEEN ? AND ?
          AND (${customDeptPred})
      )
      ORDER BY created_at
    `).all(dateFrom, dateTo, dateFrom, dateTo)
  },

  salesMonthly(year: number, month: number) {
    const db = getDb()
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return db.prepare(`
      SELECT day,
             COALESCE(SUM(count),0) as count,
             COALESCE(SUM(revenue),0) as revenue,
             COALESCE(SUM(collected),0) as collected,
             COALESCE(SUM(outstanding),0) as outstanding
      FROM (
        SELECT date(created_at) as day,
               COUNT(*) as count,
               COALESCE(SUM(total_amount),0) as revenue,
               COALESCE(SUM(amount_paid),0) as collected,
               COALESCE(SUM(balance_due),0) as outstanding
        FROM sales WHERE strftime('%Y-%m', created_at) = ? AND status != 'voided'
        GROUP BY date(created_at)
        UNION ALL
        SELECT date(created_at) as day,
               COUNT(*) as count,
               COALESCE(SUM(amount),0) as revenue,
               COALESCE(SUM(amount),0) as collected,
               0 as outstanding
        FROM custom_receipts WHERE strftime('%Y-%m', created_at) = ?
        GROUP BY date(created_at)
      )
      GROUP BY day
      ORDER BY day
    `).all(prefix, prefix)
  },

  profit(dateFrom: string, dateTo: string, department: ReportDepartmentFilter = 'all') {
    const db = getDb()
    const deptPred = invoiceDeptPredicate(department, 'i')
    const customDeptPred = customReceiptDeptPredicate(department, 'cr')
    return db.prepare(`
      SELECT
        day,
        COALESCE(SUM(revenue),0) as revenue,
        COALESCE(SUM(cogs),0) as cogs,
        COALESCE(SUM(revenue),0) - COALESCE(SUM(cogs),0) as gross_profit
      FROM (
        SELECT
          date(s.created_at) as day,
          COALESCE(SUM(s.total_amount),0) as revenue,
          COALESCE(SUM(si.cost_price * si.quantity),0) as cogs
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN invoices i ON i.sale_id = s.id
        WHERE s.created_at BETWEEN ? AND ? AND s.status != 'voided'
          AND (${deptPred})
        GROUP BY date(s.created_at)

        UNION ALL

        SELECT
          date(cr.created_at) as day,
          COALESCE(SUM(cr.amount),0) as revenue,
          COALESCE(SUM(
            COALESCE(
              (SELECT SUM(CAST(json_extract(j.value, '$.cost') AS REAL))
               FROM json_each(CASE WHEN json_valid(cr.mechanical_services_json) THEN cr.mechanical_services_json ELSE '[]' END) j),
              0
            ) +
            COALESCE(
              (SELECT SUM(CAST(json_extract(j2.value, '$.cost') AS REAL))
               FROM json_each(CASE WHEN json_valid(cr.programming_services_json) THEN cr.programming_services_json ELSE '[]' END) j2),
              0
            )
          ), 0) as cogs
        FROM custom_receipts cr
        WHERE cr.created_at BETWEEN ? AND ?
          AND (${customDeptPred})
        GROUP BY date(cr.created_at)
      )
      GROUP BY day
      ORDER BY day
    `).all(dateFrom, dateTo, dateFrom, dateTo)
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
      WHERE s.created_at BETWEEN ? AND ? AND s.status != 'voided'
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

  employeesAvailableToday(): {
    mechanical_total: number
    mechanical_available: number
    programming_total: number
    programming_available: number
    both_total: number
    both_available: number
    not_marked: number
    unavailable_reason: Array<{
      employee_id: string
      full_name: string
      department: string
      reason: 'absent' | 'leave' | 'on_task' | 'vacation' | 'not_marked'
    }>
  } {
    const db = getDb()
    const today = new Date().toISOString().split('T')[0]

    // Tasks: no `tasks.assigned_to`; assignees live in `task_assignments.user_id` → `users.id`.
    // Approximate per-employee active task count by matching `users.full_name` to `employees.full_name`.
    const rows = db
      .prepare(
        `
      SELECT 
        e.id,
        e.employee_id,
        e.full_name,
        e.department,
        e.is_on_vacation,
        ast.name AS status_name,
        ast.counts_as_working,
        (
          SELECT COUNT(*) FROM task_assignments ta
          INNER JOIN tasks t ON t.id = ta.task_id
          INNER JOIN users u ON u.id = ta.user_id
          WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(e.full_name))
            AND LENGTH(TRIM(e.full_name)) > 0
            AND t.status NOT IN ('done', 'cancelled')
        ) AS active_tasks
      FROM employees e
      LEFT JOIN employee_attendance ea
        ON ea.employee_id = e.id
        AND ea.date = ?
      LEFT JOIN attendance_status_types ast
        ON ast.id = ea.status_type_id
      WHERE e.employment_status = 'active'
      ORDER BY e.department, e.full_name
    `
      )
      .all(today) as Array<{
      id: number
      employee_id: string
      full_name: string
      department: string | null
      is_on_vacation: number
      status_name: string | null
      counts_as_working: number | null
      active_tasks: number
    }>

    let mech_total = 0
    let mech_avail = 0
    let prog_total = 0
    let prog_avail = 0
    let both_total = 0
    let both_avail = 0
    let not_marked = 0

    const unavailable: Array<{
      employee_id: string
      full_name: string
      department: string
      reason: 'absent' | 'leave' | 'on_task' | 'vacation' | 'not_marked'
    }> = []

    for (const emp of rows) {
      const deptRaw = emp.department?.trim().toLowerCase() ?? ''
      const dept =
        deptRaw === 'mechanical' || deptRaw === 'programming' ? deptRaw : 'both'

      if (dept === 'mechanical') mech_total++
      else if (dept === 'programming') prog_total++
      else both_total++

      let available = false
      let reason: 'absent' | 'leave' | 'on_task' | 'vacation' | 'not_marked' | null = null

      if (emp.is_on_vacation) {
        reason = 'vacation'
      } else if (!emp.status_name) {
        reason = 'not_marked'
        not_marked++
      } else if (emp.counts_as_working === 1 && emp.active_tasks === 0) {
        available = true
      } else if (emp.active_tasks > 0) {
        reason = 'on_task'
      } else {
        reason = emp.status_name.toLowerCase().includes('sick') ? 'leave' : 'absent'
      }

      if (available) {
        if (dept === 'mechanical') mech_avail++
        else if (dept === 'programming') prog_avail++
        else both_avail++
      } else if (reason && reason !== 'not_marked') {
        unavailable.push({
          employee_id: emp.employee_id,
          full_name: emp.full_name,
          department: dept,
          reason,
        })
      }
    }

    return {
      mechanical_total: mech_total,
      mechanical_available: mech_avail,
      programming_total: prog_total,
      programming_available: prog_avail,
      both_total: both_total,
      both_available: both_avail,
      not_marked,
      unavailable_reason: unavailable,
    }
  },

  getEmployeePerformance(params: {
    employeeId?: number
    fromDate: string
    toDate: string
    department?: string
  }): Array<{
    employee_id: number
    employee_code: string
    full_name: string
    department: string
    total_jobs: number
    total_hours: number
    total_revenue: number
    avg_hours_per_job: number
    avg_revenue_per_job: number
    mechanical_jobs: number
    programming_jobs: number
    both_jobs: number
  }> {
    const db = getDb()

    let whereClause = `
      WHERE cr.created_at >= ?
      AND cr.created_at <= ?
      AND (
        cr.primary_employee_id IS NOT NULL
        OR cr.assistant_employee_id IS NOT NULL
      )
    `
    const bindValues: unknown[] = [params.fromDate + ' 00:00:00', params.toDate + ' 23:59:59']

    if (params.employeeId) {
      whereClause += `
        AND (
          cr.primary_employee_id = ? OR
          cr.assistant_employee_id = ?
        )
      `
      bindValues.push(params.employeeId, params.employeeId)
    }

    if (params.department && params.department !== 'all') {
      whereClause += ` AND cr.department = ?`
      bindValues.push(params.department)
    }

    type Row = {
      employee_id: number
      employee_code: string
      full_name: string
      department: string
      total_jobs: number
      total_hours: number
      total_revenue: number
      avg_hours_per_job: number
      avg_revenue_per_job: number
      mechanical_jobs: number
      programming_jobs: number
      both_jobs: number
    }

    return db
      .prepare(
        `
      SELECT
        e.id AS employee_id,
        e.employee_id AS employee_code,
        e.full_name,
        COALESCE(e.department, 'both')
          AS department,
        COUNT(DISTINCT cr.id) AS total_jobs,
        COALESCE(SUM(cr.hours_worked), 0)
          AS total_hours,
        COALESCE(SUM(cr.amount), 0)
          AS total_revenue,
        CASE
          WHEN COUNT(DISTINCT cr.id) > 0
          THEN COALESCE(SUM(cr.hours_worked), 0)
            / COUNT(DISTINCT cr.id)
          ELSE 0
        END AS avg_hours_per_job,
        CASE
          WHEN COUNT(DISTINCT cr.id) > 0
          THEN COALESCE(SUM(cr.amount), 0)
            / COUNT(DISTINCT cr.id)
          ELSE 0
        END AS avg_revenue_per_job,
        SUM(CASE
          WHEN cr.department = 'mechanical'
          THEN 1 ELSE 0
        END) AS mechanical_jobs,
        SUM(CASE
          WHEN cr.department = 'programming'
          THEN 1 ELSE 0
        END) AS programming_jobs,
        SUM(CASE
          WHEN cr.department = 'both'
          THEN 1 ELSE 0
        END) AS both_jobs
      FROM employees e
      INNER JOIN custom_receipts cr
        ON (
          cr.primary_employee_id = e.id OR
          cr.assistant_employee_id = e.id
        )
      ${whereClause}
      GROUP BY e.id
      ORDER BY total_revenue DESC
    `,
      )
      .all(...bindValues) as Row[]
  },
}
