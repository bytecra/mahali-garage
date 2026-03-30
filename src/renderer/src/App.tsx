import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore, applyTheme } from './store/themeStore'
import { useLangStore } from './store/langStore'
import { useBrandingStore } from './store/brandingStore'
import { useCurrencyStore } from './store/currencyStore'
import { applyLanguage } from './i18n/index'
import AppShell from './components/layout/AppShell'
import ProtectedRoute from './components/layout/ProtectedRoute'
import LoginPage from './pages/Login/LoginPage'
import DashboardPage from './pages/Dashboard/DashboardPage'

import { lazy, Suspense } from 'react'
const POSPage         = lazy(() => import('./pages/POS/POSPage'))
const InventoryPage   = lazy(() => import('./pages/Inventory/InventoryPage'))
const CustomersPage   = lazy(() => import('./pages/Customers/CustomersPage'))
const RepairsPage     = lazy(() => import('./pages/Repairs/RepairsPage'))
const ReportsPage     = lazy(() => import('./pages/Reports/ReportsPage'))
const UsersPage       = lazy(() => import('./pages/Users/UsersPage'))
const SettingsPage    = lazy(() => import('./pages/Settings/SettingsPage'))
const ExpensesPage    = lazy(() => import('./pages/Expenses/ExpensesPage'))
const TasksPage       = lazy(() => import('./pages/Tasks/TasksPage'))
const CalendarPage    = lazy(() => import('./pages/Calendar/CalendarPage'))
const InvoicesPage    = lazy(() => import('./pages/Invoices/InvoicesPage'))
const VehiclesPage    = lazy(() => import('./pages/Vehicles/VehiclesPage'))
const ServiceCatalogPage = lazy(() => import('./pages/ServiceCatalog/ServiceCatalogPage'))
const ServicesPage    = lazy(() => import('./pages/Services/ServicesPage'))
const CustomReceiptsPage = lazy(() => import('./pages/CustomReceipts/CustomReceiptsPage'))
const EmployeesPage     = lazy(() => import('./pages/Employees/EmployeesPage'))
const AssetsPage        = lazy(() => import('./pages/Assets/AssetsPage'))

function LoadingFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

/** Preserves sub-path when legacy `/customers/...` links are used. */
function CustomersToOwnersRedirect(): JSX.Element {
  const loc = useLocation()
  const to = `${loc.pathname.replace(/^\/customers/, '/owners')}${loc.search}`
  return <Navigate to={to} replace />
}

/** `file://` + BrowserRouter breaks on Windows; HashRouter works in packaged builds. Dev uses http://localhost — BrowserRouter is fine. */
const Router = import.meta.env.DEV ? BrowserRouter : HashRouter

export default function App(): JSX.Element {
  const { setUser, setLoading } = useAuthStore()
  const { setTheme } = useThemeStore()
  const { setLang } = useLangStore()
  const { load: loadBranding } = useBrandingStore()
  const { syncFromSettings: syncCurrency } = useCurrencyStore()

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const settingsRes = await window.electronAPI.settings.getAll()
        if (settingsRes.success && settingsRes.data) {
          const s = settingsRes.data
          syncCurrency(s as Record<string, string>)

          const theme = (s['appearance.theme'] as 'light' | 'dark' | 'system') || 'system'
          setTheme(theme)
          applyTheme(theme)

          const lang = (s['appearance.language'] as 'en' | 'ar') || 'en'
          setLang(lang)
          applyLanguage(lang)
        }

        await loadBranding()

        const sessionRes = await window.electronAPI.auth.getSession()
        if (sessionRes.success && sessionRes.data) {
          setUser(sessionRes.data)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/quick-invoice" element={
              <Suspense fallback={<LoadingFallback />}><POSPage /></Suspense>
            } />
            <Route path="/pos" element={<Navigate to="/quick-invoice" replace />} />
            <Route path="/job-cards" element={
              <Suspense fallback={<LoadingFallback />}><RepairsPage /></Suspense>
            } />
            <Route path="/repairs/*" element={<Navigate to="/job-cards" replace />} />
            <Route path="/vehicles/*" element={
              <Suspense fallback={<LoadingFallback />}><VehiclesPage /></Suspense>
            } />
            <Route path="/service-catalog" element={
              <Suspense fallback={<LoadingFallback />}><ServiceCatalogPage /></Suspense>
            } />
            <Route path="/services" element={
              <Suspense fallback={<LoadingFallback />}><ServicesPage /></Suspense>
            } />
            <Route path="/parts" element={
              <Suspense fallback={<LoadingFallback />}><InventoryPage /></Suspense>
            } />
            <Route path="/inventory" element={<Navigate to="/parts" replace />} />
            <Route path="/owners/*" element={
              <Suspense fallback={<LoadingFallback />}><CustomersPage /></Suspense>
            } />
            <Route path="/customers/*" element={<CustomersToOwnersRedirect />} />
            <Route path="/reports/*" element={
              <Suspense fallback={<LoadingFallback />}><ReportsPage /></Suspense>
            } />
            <Route path="/users" element={
              <Suspense fallback={<LoadingFallback />}><UsersPage /></Suspense>
            } />
            <Route path="/settings/*" element={
              <Suspense fallback={<LoadingFallback />}><SettingsPage /></Suspense>
            } />
            <Route path="/expenses" element={
              <Suspense fallback={<LoadingFallback />}><ExpensesPage /></Suspense>
            } />
            <Route path="/assets" element={
              <Suspense fallback={<LoadingFallback />}><AssetsPage /></Suspense>
            } />
            <Route path="/tasks" element={
              <Suspense fallback={<LoadingFallback />}><TasksPage /></Suspense>
            } />
            <Route path="/calendar" element={
              <Suspense fallback={<LoadingFallback />}><CalendarPage /></Suspense>
            } />
            <Route path="/invoices" element={
              <Suspense fallback={<LoadingFallback />}><InvoicesPage /></Suspense>
            } />
            <Route path="/custom-receipts" element={
              <Suspense fallback={<LoadingFallback />}><CustomReceiptsPage /></Suspense>
            } />
            <Route path="/employees" element={
              <Suspense fallback={<LoadingFallback />}><EmployeesPage /></Suspense>
            } />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
