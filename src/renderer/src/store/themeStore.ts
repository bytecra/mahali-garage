import { create } from 'zustand'
import { useAuthStore } from './authStore'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', isDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',

  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    const loggedIn = useAuthStore.getState().user != null
    if (loggedIn) {
      void window.electronAPI.users.updateMyPreferences({ theme }).catch(() => {})
    } else {
      void window.electronAPI.settings.set('appearance.theme', theme).catch(() => {})
    }
  },
}))

// Watch OS theme changes when using 'system'
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') applyTheme('system')
  })
}

export { applyTheme }
