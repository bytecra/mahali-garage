import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, ReceiptText, Package, Users, Wrench,
  BarChart3, UserCog, Settings, Receipt, CheckSquare, CalendarDays, FileText, Lock,
  Car, Cog, HardHat, ClipboardList, Building2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/authStore'

interface NavItem {
  to: string
  icon: React.ElementType
  labelKey: string
  permission?: string
  feature?: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',     icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/custom-receipts?mode=smart', icon: ReceiptText, labelKey: 'nav.smartRecipe', permission: 'sales.view' },
  { to: '/job-cards',     icon: Wrench,          labelKey: 'nav.jobCards',     permission: 'repairs.view',   feature: 'job_cards.view' },
  { to: '/vehicles',      icon: Car,             labelKey: 'nav.vehicles',     permission: 'repairs.view',   feature: 'vehicles.view' },
  { to: '/service-catalog', icon: ClipboardList, labelKey: 'nav.serviceCatalog', permission: 'repairs.view', feature: 'job_cards.view' },
  { to: '/services',      icon: Cog,             labelKey: 'nav.services',                                   feature: 'services.view' },
  { to: '/parts',         icon: Package,         labelKey: 'nav.parts',        permission: 'inventory.view' },
  { to: '/owners',        icon: Users,           labelKey: 'nav.owners',       permission: 'customers.view' },
  { to: '/reports',       icon: BarChart3,       labelKey: 'nav.reports',      permission: 'reports.view',   feature: 'reports.view' },
  { to: '/expenses',      icon: Receipt,         labelKey: 'nav.expenses',     permission: 'expenses.view',  feature: 'expenses.view' },
  { to: '/assets',        icon: Building2,     labelKey: 'nav.assets',       permission: 'assets.view' },
  { to: '/tasks',         icon: CheckSquare,     labelKey: 'nav.tasks',        permission: 'tasks.view',     feature: 'tasks.view' },
  { to: '/calendar',      icon: CalendarDays,    labelKey: 'nav.calendar',     permission: 'tasks.view',     feature: 'calendar.view' },
  { to: '/invoices',      icon: FileText,        labelKey: 'nav.invoices',     permission: 'sales.view',     feature: 'invoices.view' },
  { to: '/users',         icon: UserCog,         labelKey: 'nav.users',        permission: 'users.manage' },
  { to: '/employees',     icon: HardHat,         labelKey: 'nav.employees',    permission: 'users.manage' },
  { to: '/settings',      icon: Settings,        labelKey: 'nav.settings',     permission: 'settings.manage' },
]

interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps): JSX.Element {
  const { t } = useTranslation()
  const { hasPermission } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [locked, setLocked] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const features = [
        'job_cards.view','vehicles.view','services.view',
        'reports.view','expenses.view','tasks.view','calendar.view','invoices.view',
      ]
      try {
        const results = await Promise.all(
          features.map(async f => {
            const res = await window.electronAPI.license.hasFeature(f)
            return { feature: f, allowed: res.success ? Boolean(res.data) : false }
          })
        )
        if (cancelled) return
        const lockedSet = new Set(results.filter(r => !r.allowed).map(r => r.feature))
        setLocked(lockedSet)
      } catch {
        if (!cancelled) setLocked(new Set())
      }
    })()
    return () => { cancelled = true }
  }, [])
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  function isItemActive(to: string, navIsActive: boolean): boolean {
    // Keep normal behavior for everything except the two custom-receipts variants.
    if (!to.startsWith('/custom-receipts')) return navIsActive
    const isSmart = to.includes('mode=smart')
    const currentMode = new URLSearchParams(location.search).get('mode')
    if (isSmart) return location.pathname === '/custom-receipts' && currentMode === 'smart'
    return location.pathname === '/custom-receipts' && currentMode !== 'smart'
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-sidebar border-e border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Nav items */}
      <nav className="flex-1 pt-8 pb-4 space-y-1 px-2 overflow-y-auto">
        {visibleItems.map((item) => (
          (() => {
            const isLocked = item.feature ? locked.has(item.feature) : false
            if (isLocked) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground/40 cursor-not-allowed"
                  title={t('settings.license.upgradeHint') || 'Upgrade your plan to unlock this feature.'}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1">{t(item.labelKey)}</span>
                      <Lock className="w-4 h-4 shrink-0" />
                    </>
                  )}
                </div>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium',
                    isItemActive(item.to, isActive)
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </NavLink>
            )
          })()
        ))}
      </nav>
    </aside>
  )
}
