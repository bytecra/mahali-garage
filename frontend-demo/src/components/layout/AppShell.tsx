import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ToastContainer from '../shared/ToastContainer'

export default function AppShell(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

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
