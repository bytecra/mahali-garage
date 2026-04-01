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

  useAppShortcuts()

  useEffect(() => {
    if (user) loadNavColor(user.userId)
  }, [user?.userId])

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
    </div>
  )
}
