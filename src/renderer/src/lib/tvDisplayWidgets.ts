export const TV_DISPLAY_WIDGETS = [
  { id: 'vehicles_in_garage', label: 'Vehicles in Garage' },
  { id: 'active_job_cards', label: 'Active Job Cards' },
  { id: 'ready_for_pickup', label: 'Ready for Pickup' },
  { id: 'today_delivered', label: "Today's Delivered" },
  { id: 'cash_in_hand', label: 'Cash in Hand' },
  { id: 'today_sales', label: "Today's Sales" },
  { id: 'job_cards_kanban', label: 'Job Cards Kanban' },
  { id: 'current_time_date', label: 'Current Time & Date' }, // always enabled
] as const

export type TvDisplayWidgetId = (typeof TV_DISPLAY_WIDGETS)[number]['id']
export type TvDisplayWidgetsMap = Record<TvDisplayWidgetId, boolean>

export function defaultTvDisplayWidgets(): TvDisplayWidgetsMap {
  const out = {} as TvDisplayWidgetsMap
  for (const w of TV_DISPLAY_WIDGETS) out[w.id] = true
  out.current_time_date = true
  return out
}

export function parseTvDisplayWidgets(raw?: string | null): TvDisplayWidgetsMap {
  const defaults = defaultTvDisplayWidgets()
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Partial<Record<TvDisplayWidgetId, boolean>>
    for (const w of TV_DISPLAY_WIDGETS) {
      if (w.id === 'current_time_date') {
        defaults.current_time_date = true
        continue
      }
      if (typeof parsed[w.id] === 'boolean') defaults[w.id] = parsed[w.id] as boolean
    }
  } catch {
    return defaults
  }
  return defaults
}

