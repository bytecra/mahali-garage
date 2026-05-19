import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Package, Users, Wrench,
  BarChart3, UserCog, Settings, Receipt, CheckSquare, CalendarDays, FileText, Lock,
  Monitor, HardHat, ClipboardList, Building2, Brain, Archive, ShoppingCart,
  ChevronDown, ChevronRight, Cpu, RefreshCw, BookmarkCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  permission?: string
  feature?: string
  end?: boolean
}

interface NavGroup {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', end: true },
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: Wrench,
    items: [
      { to: '/job-cards',          icon: Wrench,        label: 'Work Orders',   permission: 'repairs.view', feature: 'job_cards.view', end: true },
      { to: '/job-cards/archived', icon: Archive,       label: 'Archived',      permission: 'repairs.view', feature: 'job_cards.view' },
      { to: '/builds',             icon: Cpu,           label: 'PC Builds',     permission: 'repairs.view' },
      { to: '/invoices',           icon: FileText,      label: 'Invoices',      permission: 'sales.view',   feature: 'invoices.view' },
      { to: '/quick-invoice',      icon: ShoppingCart,  label: 'Quick Sale',    permission: 'sales.view' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: Package,
    items: [
      { to: '/devices',         icon: Monitor,        label: 'Devices',         permission: 'repairs.view',    feature: 'vehicles.view' },
      { to: '/service-catalog', icon: ClipboardList, label: 'Service Catalog', permission: 'repairs.view',    feature: 'job_cards.view' },
      { to: '/parts',           icon: Package,        label: 'Inventory',       permission: 'inventory.view' },
      { to: '/buybacks',        icon: RefreshCw,      label: 'Buybacks',        permission: 'repairs.view' },
      { to: '/reservations',    icon: BookmarkCheck,  label: 'Reservations',    permission: 'repairs.view' },
      { to: '/owners',          icon: Users,          label: 'Customers',       permission: 'customers.view' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: BarChart3,
    items: [
      { to: '/reports',  icon: BarChart3, label: 'Reports',  permission: 'reports.view',  feature: 'reports.view' },
      { to: '/expenses', icon: Receipt,   label: 'Expenses', permission: 'expenses.view', feature: 'expenses.view' },
      { to: '/assets',   icon: Building2, label: 'Assets',   permission: 'assets.view' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: CheckSquare,
    items: [
      { to: '/tasks',    icon: CheckSquare,  label: 'Tasks',    permission: 'tasks.view', feature: 'tasks.view' },
      { to: '/calendar', icon: CalendarDays, label: 'Calendar', permission: 'tasks.view', feature: 'calendar.view' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    icon: HardHat,
    items: [
      { to: '/employees', icon: HardHat,  label: 'Employees', permission: 'users.manage' },
      { to: '/users',     icon: UserCog,  label: 'Users',     permission: 'users.manage' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    items: [
      { to: '/ai-assistant', icon: Brain,    label: 'AI Assistant' },
      { to: '/settings',     icon: Settings, label: 'Settings',    permission: 'settings.manage' },
    ],
  },
]

function groupContainsPath(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => pathname.startsWith(item.to))
}

// ── Collapsed flyout for a single group ────────────────────────────────────
function CollapsedGroupFlyout({
  group,
  locked,
  hasPermission,
}: {
  group: NavGroup
  locked: Set<string>
  hasPermission: (p: string) => boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  const visibleItems = group.items.filter(
    item => !item.permission || hasPermission(item.permission)
  )
  if (visibleItems.length === 0) return <></>

  const isGroupActive = groupContainsPath(group, location.pathname)

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setTop(rect.top)
    }
    setOpen(true)
  }
  function hide() {
    timerRef.current = setTimeout(() => setOpen(false), 120)
  }
  function keepOpen() {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  return (
    <div
      ref={ref}
      className="relative px-2 mb-0.5"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {/* Icon button */}
      <div
        className={cn(
          'flex items-center justify-center w-full py-2.5 cursor-pointer transition-all duration-150',
          isGroupActive
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
        )}
      >
        <group.icon className="w-4 h-4" />
      </div>

      {/* Flyout panel */}
      {open && (
        <div
          className="fixed z-50 min-w-[160px] bg-sidebar border border-sidebar-border shadow-xl py-1"
          style={{ top, left: 64 }}
          onMouseEnter={keepOpen}
          onMouseLeave={hide}
        >
          {/* Group label header */}
          <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-sidebar-primary border-b border-sidebar-border mb-1">
            {group.label}
          </div>
          {visibleItems.map(item => {
            const isLocked = item.feature ? locked.has(item.feature) : false
            if (isLocked) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-2 px-3 py-2 text-sidebar-foreground/30 cursor-not-allowed"
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs">{item.label}</span>
                  <Lock className="w-3 h-3 ml-auto" />
                </div>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 transition-all duration-100 w-full',
                    isActive
                      ? 'border-l-[2px] border-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary pl-[calc(0.75rem-2px)]'
                      : 'border-l-[2px] border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )
                }
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-medium">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main sidebar ────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps): JSX.Element {
  const { t } = useTranslation()
  const { hasPermission } = useAuthStore()
  const location = useLocation()
  const [locked, setLocked] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>(['dashboard'])
    for (const g of NAV_GROUPS) {
      if (groupContainsPath(g, location.pathname)) initial.add(g.id)
    }
    return initial
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const features = [
        'job_cards.view', 'vehicles.view', 'services.view',
        'reports.view', 'expenses.view', 'tasks.view', 'calendar.view', 'invoices.view',
      ]
      try {
        const results = await Promise.all(
          features.map(async f => {
            const res = await window.electronAPI.license.hasFeature(f)
            return { feature: f, allowed: res.success ? Boolean(res.data) : false }
          })
        )
        if (cancelled) return
        setLocked(new Set(results.filter(r => !r.allowed).map(r => r.feature)))
      } catch {
        if (!cancelled) setLocked(new Set())
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    for (const g of NAV_GROUPS) {
      if (groupContainsPath(g, location.pathname)) {
        setOpenGroups(prev => new Set([...prev, g.id]))
      }
    }
  }, [location.pathname])

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-sidebar border-e border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Brand strip */}
      <div className={cn(
        'flex items-center border-b border-sidebar-border py-4 shrink-0',
        collapsed ? 'justify-center px-0' : 'px-4 gap-2'
      )}>
        <div className="w-2 h-6 bg-sidebar-primary shrink-0" />
        {!collapsed && (
          <span className="text-xs font-bold tracking-widest uppercase text-sidebar-primary select-none">
            Power Key
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(
            item => !item.permission || hasPermission(item.permission)
          )
          if (visibleItems.length === 0) return null

          // ── COLLAPSED: flyout on hover ──────────────────────────────
          if (collapsed) {
            return (
              <CollapsedGroupFlyout
                key={group.id}
                group={group}
                locked={locked}
                hasPermission={hasPermission}
              />
            )
          }

          // ── EXPANDED: single-item group (Dashboard) ─────────────────
          if (group.items.length === 1) {
            const item = visibleItems[0]
            if (!item) return null
            return (
              <div key={group.id} className="px-2 mb-0.5">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 transition-all duration-150 w-full',
                      isActive
                        ? 'border-l-[3px] border-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary pl-[calc(0.75rem-3px)]'
                        : 'border-l-[3px] border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-primary/40'
                    )
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate text-xs tracking-widest uppercase font-bold">
                    {item.label}
                  </span>
                </NavLink>
              </div>
            )
          }

          // ── EXPANDED: collapsible group ─────────────────────────────
          const isOpen = openGroups.has(group.id)
          const isGroupActive = groupContainsPath(group, location.pathname)

          return (
            <div key={group.id} className="px-2 mb-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2.5 transition-all duration-150 text-left',
                  isGroupActive
                    ? 'text-sidebar-primary'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                )}
              >
                <group.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-xs tracking-widest uppercase font-bold truncate">
                  {group.label}
                </span>
                {isOpen
                  ? <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
                  : <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                }
              </button>

              {isOpen && (
                <div className="ml-3 border-l border-sidebar-border/50 pl-2 space-y-0.5 mb-1">
                  {visibleItems.map(item => {
                    const isLocked = item.feature ? locked.has(item.feature) : false
                    if (isLocked) {
                      return (
                        <div
                          key={item.to}
                          className="flex items-center gap-2 px-3 py-2 text-sidebar-foreground/30 cursor-not-allowed"
                          title={t('settings.license.upgradeHint') || 'Upgrade to unlock'}
                        >
                          <item.icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate text-xs">{item.label}</span>
                          <Lock className="w-3 h-3 shrink-0 ml-auto" />
                        </div>
                      )
                    }
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 px-3 py-2 transition-all duration-150 w-full',
                            isActive
                              ? 'border-l-[2px] border-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary pl-[calc(0.75rem-2px)]'
                              : 'border-l-[2px] border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-primary/30'
                          )
                        }
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-xs font-medium">{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
