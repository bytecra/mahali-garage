import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen, LogOut, User, Moon, Sun, Monitor, Globe, Bell, CheckCheck, Palette, Package, AlertTriangle, CalendarClock, CircleDollarSign, Sparkles, FileEdit, Tv } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { useLangStore } from '../../store/langStore'
import { useNavigate } from 'react-router-dom'
import { cn, formatCurrency } from '../../lib/utils'
import CurrencyText from '../shared/CurrencyText'
import { toast } from '../../store/notificationStore'
import { usePermission } from '../../hooks/usePermission'
import { useCartStore } from '../../store/cartStore'
import { useNotificationPoll } from '../../hooks/useNotificationPoll'
import { useNavColorStore, NAV_COLOR_PRESETS, NavColorPreset } from '../../store/navColorStore'

interface NotificationRow {
  id: number
  task_id: number | null
  type: string
  title: string
  message: string
  is_read: number
  created_at: string
}

interface LowStockItem {
  id: number
  name: string
  sku: string | null
  stock_quantity: number
  low_stock_threshold: number
  unit: string
}

interface DueSoonItem {
  id: number
  name: string
  amount: number
  due_date: string
  is_overdue: number
  category_name: string | null
  category_color: string | null
}

interface TopbarProps {
  collapsed: boolean
  onToggle: () => void
}

const NOTIF_TYPE_ICON: Record<string, string> = {
  assigned:  '📋',
  due_soon:  '⏰',
  overdue:   '🔴',
  updated:   '✏️',
  completed: '✅',
  password_reset_request: '🔑',
  password_reset_approved: '✅',
}

export default function Topbar({ collapsed, onToggle }: TopbarProps): JSX.Element {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const { navColor, setNavColor } = useNavColorStore()
  const navigate = useNavigate()
  const canSales      = usePermission('sales.create')
  const canInventory  = usePermission('inventory.view')
  const canExpenses   = usePermission('expenses.view')
  const clearCart = useCartStore(s => s.clear)
  const { unreadCount, lowStockCount, dueSoonCount, resetRequestCount, refresh } = useNotificationPoll(60_000)

  const [notifOpen, setNotifOpen]         = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [resetRequests, setResetRequests] = useState<
    Array<{
      id: number
      user_id: number
      username: string
      full_name: string
      requested_at: string
    }>
  >([])
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [dueSoonItems, setDueSoonItems]   = useState<DueSoonItem[]>([])
  const [colorOpen, setColorOpen]         = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)

  const totalBadge = unreadCount + lowStockCount + dueSoonCount + resetRequestCount

  const handleLogout = (): void => {
    logout()
    navigate('/login')
  }

  const handleSmartRecipe = (): void => {
    clearCart()
    navigate('/custom-receipts?mode=smart')
  }

  const handleCustomRecipe = (): void => {
    clearCart()
    navigate('/custom-receipts?mode=custom')
  }

  const handleOpenTvDisplay = async (): Promise<void> => {
    await window.electronAPI.tv.open()
  }

  const themes = [
    { value: 'light', icon: Sun,     label: t('settings.light') },
    { value: 'dark',  icon: Moon,    label: t('settings.dark') },
    { value: 'system',icon: Monitor, label: t('settings.system') },
  ] as const

  // Load notifications + low-stock + due-soon when dropdown opens; also refresh badge counts
  useEffect(() => {
    if (!notifOpen) return
    refresh()
    window.electronAPI.notifications.list(20).then(res => {
      if (res.success) setNotifications(res.data as NotificationRow[])
    })
    if (canInventory) {
      window.electronAPI.products.getLowStock().then(res => {
        if (res.success) setLowStockItems(res.data as LowStockItem[])
      })
    }
    if (canExpenses) {
      window.electronAPI.expenses.upcomingDue(7).then(res => {
        if (res.success) setDueSoonItems(res.data as DueSoonItem[])
      })
    }
    if (user?.role === 'owner' || user?.role === 'manager') {
      window.electronAPI.auth.getPendingResetRequests().then(res => {
        if (res.success) {
          const rows = (res.data ?? []) as Array<{
            id: number
            user_id: number
            username: string
            full_name: string
            requested_at: string
          }>
          setResetRequests(
            rows.map(r => ({
              id: r.id,
              user_id: r.user_id,
              username: r.username,
              full_name: r.full_name,
              requested_at: r.requested_at,
            })),
          )
        }
      })
    } else {
      setResetRequests([])
    }
  }, [notifOpen, user?.role])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkRead = async (id: number) => {
    await window.electronAPI.notifications.markRead(id)
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: 1 } : x))
    refresh()
  }

  const handleMarkAllRead = async () => {
    await window.electronAPI.notifications.markAllRead()
    setNotifications(n => n.map(x => ({ ...x, is_read: 1 })))
    refresh()
  }

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
      {/* Left: toggle */}
      <button
        onClick={onToggle}
        className="p-2 rounded-md hover:bg-muted transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <PanelLeftOpen className="w-5 h-5" />
          : <PanelLeftClose className="w-5 h-5" />
        }
      </button>

      {/* Center: Smart Recipe + Custom Recipe */}
      {canSales && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSmartRecipe}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            {t('nav.smartRecipe')}
          </button>
          <button
            type="button"
            onClick={handleCustomRecipe}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            <FileEdit className="w-4 h-4 shrink-0" />
            {t('nav.customRecipe')}
          </button>
        </div>
      )}

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleOpenTvDisplay()}
          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Open TV Display"
        >
          <Tv className="w-5 h-5" />
        </button>

        {/* Language switcher */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          <Globe className="w-4 h-4 text-muted-foreground ms-1" />
          <button
            onClick={() => setLang('en')}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              lang === 'en' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >EN</button>
          <button
            onClick={() => setLang('ar')}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              lang === 'ar' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >ع</button>
        </div>

        {/* Theme switcher */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          {themes.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              className={cn(
                'p-1 rounded transition-colors',
                theme === value ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Nav color picker */}
        <div ref={colorRef} className="relative">
          <button
            onClick={() => setColorOpen(o => !o)}
            className={cn(
              'p-2 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted',
              colorOpen && 'bg-muted text-foreground'
            )}
            title="Sidebar color"
          >
            <Palette className="w-4 h-4" />
          </button>

          {colorOpen && (
            <div className="absolute end-0 top-full mt-2 p-3 bg-card border border-border rounded-xl shadow-2xl z-50 w-60">
              <p className="text-xs font-medium text-muted-foreground mb-2">Sidebar Color</p>
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(NAV_COLOR_PRESETS) as [NavColorPreset, typeof NAV_COLOR_PRESETS[NavColorPreset]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (user) setNavColor(key, user.userId)
                      setColorOpen(false)
                    }}
                    title={config.label}
                    className={cn(
                      'w-9 h-9 rounded-lg border-2 transition-transform hover:scale-110',
                      navColor === key ? 'border-primary ring-2 ring-primary ring-offset-1' : 'border-transparent'
                    )}
                    style={{ backgroundColor: config.hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notification bell */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={t('notifications.title')}
          >
            <Bell className="w-5 h-5" />
            {totalBadge > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-sm ring-2 ring-card">
                {totalBadge > 99 ? '99+' : totalBadge}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {notifOpen && (
            <div className="absolute end-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[32rem]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 className="text-sm font-semibold">
                  {t('notifications.title')}
                  {totalBadge > 0 && (
                    <span className="ms-2 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                      {totalBadge}
                    </span>
                  )}
                </h3>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <CheckCheck className="w-3 h-3" />
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>

              <div className="overflow-y-auto flex-1">
                {/* Low stock section */}
                {canInventory && lowStockItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex-1">
                        Low Stock
                      </span>
                      <span className="text-[10px] font-bold bg-amber-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {lowStockItems.length}
                      </span>
                    </div>
                    {lowStockItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => { navigate('/parts'); setNotifOpen(false) }}
                        className="w-full text-start px-4 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'flex items-center justify-center w-7 h-7 rounded-md shrink-0',
                            item.stock_quantity === 0 ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'
                          )}>
                            <Package className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate text-foreground">{item.name}</p>
                            {item.sku && <p className="text-[10px] text-muted-foreground truncate">{item.sku}</p>}
                          </div>
                          <div className="text-end shrink-0">
                            <p className={cn(
                              'text-xs font-bold',
                              item.stock_quantity === 0 ? 'text-red-500' : 'text-amber-500'
                            )}>
                              {item.stock_quantity}
                              <span className="text-muted-foreground font-normal"> / {item.low_stock_threshold}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Due soon section */}
                {canExpenses && dueSoonItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border-b border-orange-500/20">
                      <CalendarClock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex-1">
                        Due Soon
                      </span>
                      <span className="text-[10px] font-bold bg-orange-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {dueSoonItems.length}
                      </span>
                    </div>
                    {dueSoonItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors">
                        <div className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-md shrink-0',
                          item.is_overdue ? 'bg-red-500/15 text-red-500' : 'bg-orange-500/15 text-orange-500'
                        )}>
                          <CircleDollarSign className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-foreground">{item.name}</p>
                          <p className={cn('text-[10px]', item.is_overdue ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                            {item.is_overdue ? 'Overdue · ' : 'Due · '}{item.due_date}
                          </p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className={cn('text-xs font-bold', item.is_overdue ? 'text-red-500' : 'text-orange-500')}>
                            <CurrencyText amount={item.amount} />
                          </p>
                          <button
                            onClick={() => {
                              window.electronAPI.expenses.markPaid(item.id)
                              setDueSoonItems(d => d.filter(x => x.id !== item.id))
                              refresh()
                            }}
                            className="text-[10px] text-primary hover:underline mt-0.5"
                          >
                            Mark paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {resetRequests.length > 0 && (
                  <div>
                    <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50">
                      Password Reset Requests ({resetRequests.length})
                    </p>
                    {resetRequests.map(req => (
                      <div key={req.id} className="px-3 py-3 border-b border-border/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">🔑 {req.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              @{req.username} ·{' '}
                              {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await window.electronAPI.auth.resolveResetRequest({
                                  requestId: req.id,
                                  action: 'accept',
                                })
                                if (res?.success) {
                                  setResetRequests(prev => prev.filter(r => r.id !== req.id))
                                  toast.success(`${req.full_name}'s password reset to 1234`)
                                  refresh()
                                } else {
                                  toast.error(res?.error ?? 'Failed to accept')
                                }
                              }}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              ✓ Accept
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await window.electronAPI.auth.resolveResetRequest({
                                  requestId: req.id,
                                  action: 'reject',
                                })
                                if (res?.success) {
                                  setResetRequests(prev => prev.filter(r => r.id !== req.id))
                                  refresh()
                                } else {
                                  toast.error(res?.error ?? 'Failed to reject')
                                }
                              }}
                              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted/50 text-muted-foreground"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Task notifications */}
                {notifications.length === 0 &&
                (!canInventory || lowStockItems.length === 0) &&
                (!canExpenses || dueSoonItems.length === 0) &&
                resetRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">{t('notifications.noNotifications')}</div>
                ) : notifications.length > 0 ? (
                  <div>
                    {(canInventory && lowStockItems.length > 0) ||
                    (canExpenses && dueSoonItems.length > 0) ||
                    resetRequests.length > 0 ? (
                      <div className="px-4 py-2 bg-muted/30 border-b border-border/50">
                        <span className="text-xs font-semibold text-muted-foreground">{t('notifications.title')}</span>
                      </div>
                    ) : null}
                    {notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        handleMarkRead(n.id)
                        if (n.task_id) navigate('/tasks')
                        setNotifOpen(false)
                      }}
                      className={cn(
                        'w-full text-start px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0',
                        n.is_read ? 'opacity-60' : ''
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">{NOTIF_TYPE_ICON[n.type] ?? '🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn('text-xs font-medium truncate', n.is_read ? 'text-muted-foreground' : 'text-foreground')}>{n.title}</p>
                            {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-0.5" />}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{n.message}</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 ps-2 border-s border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block text-start">
            <p className="text-sm font-medium leading-none">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors ms-1"
            title={t('common.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
