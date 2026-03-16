import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface NotificationState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    // Auto-remove after 5 seconds
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

// Convenience helpers
export const toast = {
  success: (title: string, description?: string) =>
    useNotificationStore.getState().addToast({ type: 'success', title, description }),
  error: (title: string, description?: string) =>
    useNotificationStore.getState().addToast({ type: 'error', title, description }),
  warning: (title: string, description?: string) =>
    useNotificationStore.getState().addToast({ type: 'warning', title, description }),
  info: (title: string, description?: string) =>
    useNotificationStore.getState().addToast({ type: 'info', title, description }),
}
