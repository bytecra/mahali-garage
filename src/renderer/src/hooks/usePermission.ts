import { useAuthStore } from '../store/authStore'

export function usePermission(permission: string): boolean {
  return useAuthStore((state) => state.hasPermission(permission))
}

export function useAnyPermission(permissions: string[]): boolean {
  return useAuthStore((state) =>
    permissions.some((p) => state.hasPermission(p))
  )
}
