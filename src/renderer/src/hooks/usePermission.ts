import { useAuthStore } from '../store/authStore'

export function usePermission(permission: string): boolean {
  return useAuthStore((state) => state.hasPermission(permission))
}

export function usePermissions(permissions: string[]): boolean {
  return useAuthStore((state) =>
    permissions.every((p) => state.hasPermission(p))
  )
}

export function useAnyPermission(permissions: string[]): boolean {
  return useAuthStore((state) =>
    permissions.some((p) => state.hasPermission(p))
  )
}
