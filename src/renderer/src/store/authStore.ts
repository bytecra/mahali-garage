import { create } from 'zustand'

export interface AuthUser {
  userId: number
  username: string
  fullName: string
  role: string
  permissions: string[]
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  hasPermission: (permission: string) => boolean
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),

  hasPermission: (permission) => {
    const { user } = get()
    if (!user) return false
    return user.permissions.includes(permission)
  },

  logout: () => {
    window.electronAPI.auth.logout()
    set({ user: null })
  },
}))
