import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

export function useNotificationPoll(intervalMs = 60_000) {
  const user = useAuthStore((s) => s.user)
  const userId = user?.userId
  const [unreadCount, setUnreadCount] = useState(0)

  const poll = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return }
    try {
      const res = await window.electronAPI.notifications.getUnreadCount()
      if (res.success) setUnreadCount(res.data ?? 0)
    } catch { /* ignore */ }
  }, [userId])

  useEffect(() => {
    poll()
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [poll, intervalMs])

  return { unreadCount, refresh: poll }
}
