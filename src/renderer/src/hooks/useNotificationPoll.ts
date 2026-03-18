import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

export function useNotificationPoll(intervalMs = 60_000) {
  const user = useAuthStore(s => s.user)
  const [unreadCount, setUnreadCount]     = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)

  const canViewInventory = user?.permissions.includes('inventory.view') ?? false

  const poll = useCallback(async () => {
    if (!user) {
      setUnreadCount(0)
      setLowStockCount(0)
      return
    }
    try {
      const [notifRes, lowRes] = await Promise.all([
        window.electronAPI.notifications.getUnreadCount(),
        canViewInventory
          ? window.electronAPI.products.getLowStock()
          : Promise.resolve(null),
      ])
      if (notifRes.success) setUnreadCount(notifRes.data ?? 0)
      if (lowRes?.success) setLowStockCount((lowRes.data as unknown[])?.length ?? 0)
    } catch { /* ignore */ }
  }, [user?.userId, canViewInventory])

  useEffect(() => {
    poll()
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [poll, intervalMs])

  return { unreadCount, lowStockCount, refresh: poll }
}
