import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ToastContainer from '../shared/ToastContainer'
import { useAuthStore } from '../../store/authStore'
import { useNavColorStore } from '../../store/navColorStore'
import { useAppShortcuts } from '../../hooks/useAppShortcuts'

export default function AppShell(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const user = useAuthStore(s => s.user)
  const loadNavColor = useNavColorStore(s => s.loadNavColor)

  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('')
  const [changePasswordError, setChangePasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useAppShortcuts()

  useEffect(() => {
    if (user) loadNavColor(user.userId)
  }, [user?.userId])

  useEffect(() => {
    if (!user) {
      setMustChangePassword(false)
      return
    }
    void (async () => {
      const r = await window.electronAPI.auth.checkMustChangePassword()
      if (r?.success && r.data?.mustChange) setMustChangePassword(true)
      else setMustChangePassword(false)
    })()
  }, [user?.userId])

  async function handleForceChangePassword(): Promise<void> {
    if (newPasswordVal.length < 4) {
      setChangePasswordError('Password must be at least 4 characters')
      return
    }
    if (newPasswordVal !== confirmPasswordVal) {
      setChangePasswordError('Passwords do not match')
      return
    }
    setChangingPassword(true)
    setChangePasswordError('')
    try {
      const res = await window.electronAPI.auth.changePassword({
        newPassword: newPasswordVal,
      })
      if (res?.success) {
        setMustChangePassword(false)
        setNewPasswordVal('')
        setConfirmPasswordVal('')
      } else {
        setChangePasswordError(res?.error ?? 'Failed to change password')
      }
    } catch {
      setChangePasswordError('Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <ToastContainer />

      {mustChangePassword && (
        <div className="fixed inset-0 bg-background z-[100] flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-8 w-full max-w-sm shadow-xl space-y-4 mx-4">
            <div className="text-center">
              <div className="text-4xl mb-2">🔐</div>
              <h2 className="text-lg font-bold">Change Your Password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your password has been reset. You must set a new password before continuing.
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                placeholder="New password (min 4 chars)"
                value={newPasswordVal}
                onChange={e => setNewPasswordVal(e.target.value)}
                className="w-full px-3 py-2.5 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPasswordVal}
                onChange={e => setConfirmPasswordVal(e.target.value)}
                className="w-full px-3 py-2.5 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {changePasswordError ? (
                <p className="text-xs text-destructive">{changePasswordError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleForceChangePassword()}
                disabled={changingPassword}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
              >
                {changingPassword ? 'Saving...' : 'Set New Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
