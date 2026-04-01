export const DASHBOARD_WIDGETS = [
  { id: 'vehicles_in_garage', label: 'Vehicles in Garage' },
  { id: 'ready_for_pickup', label: 'Ready for Pickup' },
  { id: 'active_job_cards', label: 'Active Job Cards' },
  { id: 'total_vehicles', label: 'Total Vehicles' },
  { id: 'today_sales', label: "Today's Sales" },
  { id: 'revenue_month', label: 'Revenue (Month)' },
  { id: 'low_stock_items', label: 'Low Stock Items' },
  { id: 'gross_profit_month', label: 'Gross Profit (Month)' },
  { id: 'expenses_month', label: 'Expenses (Month)' },
  { id: 'net_profit_month', label: 'Net Profit (Month)' },
  { id: 'total_assets', label: 'Total Assets' },
  { id: 'today_delivered', label: "Today's Delivered" },
  { id: 'cash_in_hand', label: 'Cash in Hand' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'cash_total', label: 'Total (Cash + Non-cash)' },
  { id: 'my_tasks_today', label: 'My Tasks Today' },
  { id: 'my_overdue', label: 'My Overdue' },
  { id: 'sales_trend_7_days', label: 'Sales Trend (7 days)' },
  { id: 'top_parts', label: 'Top Parts' },
  { id: 'unpaid_salaries', label: 'Unpaid Salaries' },
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]['id']

export type DashboardWidgetsMap = Record<DashboardWidgetId, boolean>

export function defaultDashboardWidgets(): DashboardWidgetsMap {
  const out = {} as DashboardWidgetsMap
  for (const w of DASHBOARD_WIDGETS) out[w.id] = true
  return out
}

export function parseDashboardWidgets(raw?: string | null): DashboardWidgetsMap {
  const defaults = defaultDashboardWidgets()
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Partial<Record<DashboardWidgetId, boolean>>
    for (const w of DASHBOARD_WIDGETS) {
      if (typeof parsed[w.id] === 'boolean') defaults[w.id] = parsed[w.id] as boolean
    }
  } catch {
    return defaults
  }
  return defaults
}
