import { create } from 'zustand'

interface BrandingState {
  appName: string
  appTagline: string
  setBranding: (name: string, tagline: string) => void
  load: () => Promise<void>
}

export const useBrandingStore = create<BrandingState>((set) => ({
  appName:    'Mahali POS',
  appTagline: 'Welcome to Mahali POS',

  setBranding: (appName, appTagline) => set({ appName, appTagline }),

  load: async () => {
    try {
      const res = await window.electronAPI.settings.getAll()
      if (res.success && res.data) {
        const s = res.data as Record<string, string>
        const appName    = s['app.name']    || 'Mahali POS'
        const appTagline = s['app.tagline'] || `Welcome to ${appName}`
        set({ appName, appTagline })
      }
    } catch {
      // keep defaults
    }
  },
}))
