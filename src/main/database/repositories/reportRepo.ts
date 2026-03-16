import { getDb } from '../index'
import { expenseRepo } from './expenseRepo'

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
    let totalVehicles = 0, vehiclesInGarage = 0, readyForPickup = 0, activeJobCards = 0
    try {
      totalVehicles = (db.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number }).cnt
      vehiclesInGarage = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status IN ('pending','in_progress','waiting_parts')`
      ).get() as { cnt: number }).cnt
      readyForPickup = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status = 'ready'`
      ).get() as { cnt: number }).cnt
      activeJobCards = (db.prepare(
        `SELECT COUNT(*) as cnt FROM job_cards WHERE status NOT IN ('delivered','cancelled')`
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

    return {
      todaySalesCount: todaySalesRow.count,
      todayRevenue: todaySalesRow.revenue,
      monthRevenue: monthRevenueRow.revenue,
      monthExpenses,
      monthGrossProfit,
      monthNetProfit,
      activeRepairs,
      lowStock,
      salesTrend,
      topProducts,
      totalVehicles,
      vehiclesInGarage,
      readyForPickup,
      activeJobCards,
      urgentJobCards,
    }
  },

  salesDaily(date: string) {
    const db = getDb()
    return db.prepare(`
      SELECT s.sale_number, i.invoice_number, s.total_amount, s.amount_paid, s.balance_due,
             s.status, s.created_at, c.name as customer_name, u.full_name as cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN invoices i ON i.sale_id = s.id
      WHERE date(s.created_at) = ? AND s.status != 'voided'
      ORDER BY s.created_at
    `).all(date)
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

  profit(dateFrom: string, dateTo: string) {
    const db = getDb()
    return db.prepare(`
      SELECT
        date(s.created_at) as day,
        COALESCE(SUM(s.total_amount),0) as revenue,
        COALESCE(SUM(si.cost_price * si.quantity),0) as cogs,
        COALESCE(SUM(s.total_amount),0) - COALESCE(SUM(si.cost_price * si.quantity),0) as gross_profit
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status != 'voided'
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

  customerDebts() {
    const db = getDb()
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
  },
}
