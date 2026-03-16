import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'

interface FeatureGateProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showUpgrade?: boolean
}

export function FeatureGate({ feature, children, fallback, showUpgrade = true }: FeatureGateProps) {
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.electronAPI.license.hasFeature(feature)
        if (!cancelled && res.success) {
          setHasAccess(Boolean(res.data))
        }
      } catch {
        if (!cancelled) setHasAccess(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [feature])

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  }

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>
    if (!showUpgrade) return null
    return <UpgradeRequired feature={feature} />
  }

  return <>{children}</>
}

function UpgradeRequired({ feature }: { feature: string }) {
  const [tier, setTier] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const res = await window.electronAPI.license.getTier()
        if (res.success) setTier(String(res.data))
      } catch {
        setTier('')
      }
    })()
  }, [])

  const requiredTiers = (() => {
    if (feature.startsWith('repairs')) return ['PREMIUM']
    if (
      feature.startsWith('reports') ||
      feature.startsWith('expenses') ||
      feature.startsWith('tasks') ||
      feature.startsWith('calendar') ||
      feature.startsWith('invoices')
    )
      return ['STANDARD', 'PREMIUM']
    return []
  })()

  return (
    <div className="flex items-center justify-center min-h-[320px] p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Upgrade Required</h2>
        <p className="text-muted-foreground mb-4">This feature is available in:</p>
        <div className="space-y-2 mb-4">
          {requiredTiers.includes('STANDARD') && (
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 mx-1">
              STANDARD – $249
            </span>
          )}
          {requiredTiers.includes('PREMIUM') && (
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 mx-1">
              PREMIUM – $499
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Current plan: <span className="font-semibold">{tier || 'Unknown'}</span>
        </p>
        <button
          type="button"
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          onClick={() => {
            // Navigate to settings license tab (assuming route exists)
            window.location.hash = '#/settings'
          }}
        >
          Upgrade Your License
        </button>
      </div>
    </div>
  )
}

