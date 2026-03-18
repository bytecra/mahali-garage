import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

export function useNotificationPoll(intervalMs = 60_000) {
  const user = useAuthStore(s => s.user)
  const [unreadCount, setUnreadCount]       = useState(0)
  const [lowStockCount, setLowStockCount]   = useState(0)
  const [dueSoonCount, setDueSoonCount]     = useState(0)

  const canViewInventory = user?.permissions.includes('inventory.view') ?? false
  const canViewExpenses  = user?.permissions.includes('expenses.view')  ?? false

  const poll = useCallback(async () => {
    if (!user) {
      setUnreadCount(0)
      setLowStockCount(0)
      setDueSoonCount(0)
      return
    }
    try {
      const [notifRes, lowRes, dueRes] = await Promise.all([
        window.electronAPI.notifications.getUnreadCount(),
        canViewInventory
          ? window.electronAPI.products.getLowStock()
          : Promise.resolve(null),
        canViewExpenses
          ? window.electronAPI.expenses.upcomingDue(7)
          : Promise.resolve(null),
      ])
      if (notifRes.success) setUnreadCount(notifRes.data ?? 0)
      if (lowRes?.success)  setLowStockCount((lowRes.data as unknown[])?.length ?? 0)
      if (dueRes?.success)  setDueSoonCount((dueRes.data as unknown[])?.length ?? 0)
    } catch { /* ignore */ }
  }, [user?.userId, canViewInventory, canViewExpenses])

  useEffect(() => {
    poll()
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [poll, intervalMs])

  return { unreadCount, lowStockCount, dueSoonCount, refresh: poll }
}
