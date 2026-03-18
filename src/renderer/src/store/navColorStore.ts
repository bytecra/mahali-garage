import { create } from 'zustand'

export type NavColorPreset =
  | 'default'
  | 'slate'
  | 'emerald'
  | 'crimson'
  | 'violet'
  | 'amber'
  | 'teal'
  | 'rose'

export interface NavColorConfig {
  bg: string
  accent: string
  primary: string
  label: string
  hex: string
}

export const NAV_COLOR_PRESETS: Record<NavColorPreset, NavColorConfig> = {
  default: { bg: '222.2 47.4% 11.2%', accent: '217.2 32.6% 17.5%', primary: '221.2 83.2% 53.3%', label: 'Default', hex: '#1a2744' },
  slate:   { bg: '215 25% 15%',        accent: '215 20% 22%',        primary: '210 100% 56%',       label: 'Slate',   hex: '#1d2535' },
  emerald: { bg: '160 84% 9%',         accent: '160 60% 16%',        primary: '160 84% 39%',        label: 'Emerald', hex: '#052b1a' },
  crimson: { bg: '345 60% 11%',        accent: '345 45% 19%',        primary: '345 82% 50%',        label: 'Crimson', hex: '#2b0d14' },
  violet:  { bg: '262 45% 13%',        accent: '262 35% 21%',        primary: '262 83% 58%',        label: 'Violet',  hex: '#180d34' },
  amber:   { bg: '20 65% 11%',         accent: '20 50% 19%',         primary: '38 95% 53%',         label: 'Amber',   hex: '#271400' },
  teal:    { bg: '185 55% 10%',        accent: '185 40% 17%',        primary: '185 84% 39%',        label: 'Teal',    hex: '#061e22' },
  rose:    { bg: '330 55% 11%',        accent: '330 40% 19%',        primary: '330 82% 55%',        label: 'Rose',    hex: '#2b0d1a' },
}

export function applyNavColor(preset: NavColorPreset): void {
  const { bg, accent, primary } = NAV_COLOR_PRESETS[preset]
  const root = document.documentElement
  root.style.setProperty('--sidebar-background', bg)
  root.style.setProperty('--sidebar-accent', accent)
  root.style.setProperty('--sidebar-accent-foreground', '210 40% 98%')
  root.style.setProperty('--sidebar-border', accent)
  root.style.setProperty('--sidebar-primary', primary)
  root.style.setProperty('--sidebar-ring', primary)
}

interface NavColorState {
  navColor: NavColorPreset
  setNavColor: (preset: NavColorPreset, userId: number) => void
  loadNavColor: (userId: number) => Promise<void>
}

export const useNavColorStore = create<NavColorState>((set) => ({
  navColor: 'default',

  setNavColor: (preset, userId) => {
    set({ navColor: preset })
    applyNavColor(preset)
    window.electronAPI.settings
      .set(`user.${userId}.appearance.navColor`, preset)
      .catch(() => {})
  },

  loadNavColor: async (userId) => {
    const res = await window.electronAPI.settings.get(`user.${userId}.appearance.navColor`)
    if (res.success && res.data) {
      const preset = res.data as NavColorPreset
      if (NAV_COLOR_PRESETS[preset]) {
        set({ navColor: preset })
        applyNavColor(preset)
        return
      }
    }
    // Apply default if no saved preference
    applyNavColor('default')
  },
}))
