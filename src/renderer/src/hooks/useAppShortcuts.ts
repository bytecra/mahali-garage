import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const DEFAULT_SHORTCUTS: Record<string, string> = {
  custom_recipe: 'ctrl+shift+c',
  tv_on: 'ctrl+shift+t',
  tv_off: 'ctrl+shift+w',
  add_customer: 'ctrl+shift+u',
  add_vehicle: 'ctrl+shift+v',
}

export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (parts.length === 0) return false

  const modKeys = new Set(['ctrl', 'shift', 'alt', 'meta'])
  const needCtrl = parts.includes('ctrl')
  const needShift = parts.includes('shift')
  const needAlt = parts.includes('alt')
  const needMeta = parts.includes('meta')

  const keyParts = parts.filter(p => !modKeys.has(p))
  if (keyParts.length !== 1) return false

  if (e.ctrlKey !== needCtrl || e.shiftKey !== needShift || e.altKey !== needAlt || e.metaKey !== needMeta) {
    return false
  }

  const want = keyParts[0]
  const actual = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
  return actual === want
}

export function useAppShortcuts(): void {
  const navigate = useNavigate()
  const shortcutsRef = useRef<Record<string, string>>({ ...DEFAULT_SHORTCUTS })
  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    void (async () => {
      const res = await window.electronAPI.settings.get('app.shortcuts')
      if (res.success && res.data) {
        try {
          const parsed = JSON.parse(res.data) as Record<string, string>
          shortcutsRef.current = { ...DEFAULT_SHORTCUTS, ...parsed }
        } catch {
          shortcutsRef.current = { ...DEFAULT_SHORTCUTS }
        }
      }
    })()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.repeat) return

      const map = shortcutsRef.current

      for (const [action, combo] of Object.entries(map)) {
        if (!matchesShortcut(e, combo)) continue

        e.preventDefault()

        switch (action) {
          case 'custom_recipe':
            navigateRef.current('/invoices')
            return
          case 'tv_on':
            void window.electronAPI.tv.open()
            return
          case 'tv_off':
            void window.electronAPI.tv.close()
            return
          case 'add_customer':
            navigateRef.current('/owners?action=new')
            return
          case 'add_vehicle':
            navigateRef.current('/vehicles?action=new')
            return
          default:
            return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
