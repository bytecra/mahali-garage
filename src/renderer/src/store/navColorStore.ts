import { create } from 'zustand'

export type NavColorPreset =
  | 'default'
  | 'slate'
  | 'charcoal'
  | 'midnight'
  | 'emerald'
  | 'forest'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'indigo'
  | 'violet'
  | 'fuchsia'
  | 'rose'
  | 'crimson'
  | 'amber'
  | 'coffee'

export interface NavColorConfig {
  bg: string
  accent: string
  primary: string
  label: string
  hex: string
}

export const NAV_COLOR_PRESETS: Record<NavColorPreset, NavColorConfig> = {
  // Blues & Neutrals
  default:  { bg: '222.2 47.4% 11.2%', accent: '217.2 32.6% 17.5%', primary: '221.2 83.2% 53.3%', label: 'Default',  hex: '#1a2744' },
  slate:    { bg: '215 25% 15%',        accent: '215 20% 22%',        primary: '210 100% 56%',       label: 'Slate',    hex: '#1d2535' },
  charcoal: { bg: '220 10% 10%',        accent: '220 8% 17%',         primary: '210 80% 56%',        label: 'Charcoal', hex: '#161a1f' },
  midnight: { bg: '240 50% 8%',         accent: '240 35% 15%',        primary: '240 80% 60%',        label: 'Midnight', hex: '#0a0a21' },
  // Greens
  emerald:  { bg: '160 84% 9%',         accent: '160 60% 16%',        primary: '160 84% 39%',        label: 'Emerald',  hex: '#052b1a' },
  forest:   { bg: '135 55% 9%',         accent: '135 40% 16%',        primary: '135 55% 38%',        label: 'Forest',   hex: '#0a2210' },
  // Teals & Cyans
  teal:     { bg: '185 55% 10%',        accent: '185 40% 17%',        primary: '185 84% 39%',        label: 'Teal',     hex: '#061e22' },
  cyan:     { bg: '195 80% 8%',         accent: '195 60% 15%',        primary: '195 95% 45%',        label: 'Cyan',     hex: '#021e27' },
  // Sky & Indigo
  sky:      { bg: '205 70% 10%',        accent: '205 55% 18%',        primary: '200 95% 50%',        label: 'Sky',      hex: '#052234' },
  indigo:   { bg: '240 55% 13%',        accent: '240 40% 21%',        primary: '240 80% 60%',        label: 'Indigo',   hex: '#0d1040' },
  // Purples & Pinks
  violet:   { bg: '262 45% 13%',        accent: '262 35% 21%',        primary: '262 83% 58%',        label: 'Violet',   hex: '#180d34' },
  fuchsia:  { bg: '290 55% 11%',        accent: '290 40% 19%',        primary: '290 85% 58%',        label: 'Fuchsia',  hex: '#200c2b' },
  // Reds & Roses
  rose:     { bg: '330 55% 11%',        accent: '330 40% 19%',        primary: '330 82% 55%',        label: 'Rose',     hex: '#2b0d1a' },
  crimson:  { bg: '345 60% 11%',        accent: '345 45% 19%',        primary: '345 82% 50%',        label: 'Crimson',  hex: '#2b0d14' },
  // Warm
  amber:    { bg: '20 65% 11%',         accent: '20 50% 19%',         primary: '38 95% 53%',         label: 'Amber',    hex: '#271400' },
  coffee:   { bg: '25 40% 11%',         accent: '25 30% 19%',         primary: '25 70% 48%',         label: 'Coffee',   hex: '#201208' },
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
