import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useBrandingStore } from '../../store/brandingStore'
import { cn } from '../../lib/utils'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const { appName, appTagline } = useBrandingStore()
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData): Promise<void> => {
    setError('')
    setIsLoading(true)
    try {
      const res = await window.electronAPI.auth.login(data)
      if (res.success && res.data) {
        setUser(res.data)
        navigate('/', { replace: true })
      } else {
        setError(t('auth.loginError'))
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-white">
          <h1 className="text-2xl font-bold">{appName}</h1>
          <p className="text-slate-400 text-sm mt-1">{appTagline || t('auth.welcome')}</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl shadow-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">{t('auth.login')}</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('auth.username')}
              </label>
              <input
                {...register('username')}
                type="text"
                autoFocus
                autoComplete="username"
                className={cn(
                  'w-full px-3 py-2.5 rounded-md border bg-background text-foreground text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                  errors.username ? 'border-destructive' : 'border-input'
                )}
                placeholder={t('auth.username')}
              />
              {errors.username && (
                <p className="text-destructive text-xs mt-1">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={cn(
                    'w-full px-3 py-2.5 pe-10 rounded-md border bg-background text-foreground text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                    errors.password ? 'border-destructive' : 'border-input'
                  )}
                  placeholder={t('auth.password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-md',
                'bg-primary text-primary-foreground font-medium text-sm',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('auth.loginButton')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
