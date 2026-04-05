import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Eye, EyeOff, Delete } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useBrandingStore } from '../../store/brandingStore'
import { cn } from '../../lib/utils'

type AuthType = 'password' | 'passcode_4' | 'passcode_6'

export default function LoginPage(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const { appName, appTagline } = useBrandingStore()
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authType, setAuthType] = useState<AuthType>('password')
  const [passcode, setPasscode] = useState('')
  const [shake, setShake] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetUsername, setResetUsername] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMode, setResetMode] = useState<'request' | 'code'>('request')
  const [requestUsername, setRequestUsername] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [requestDoneMessage, setRequestDoneMessage] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState('')

  const passcodeLength = authType === 'passcode_4' ? 4 : 6
  const isPasscodeMode = authType !== 'password'

  const canSubmit = useMemo(() => {
    if (!username.trim()) return false
    if (isPasscodeMode) return passcode.length === passcodeLength
    return password.trim().length > 0
  }, [username, isPasscodeMode, passcode.length, passcodeLength, password])

  const resolveAuthType = async (u: string): Promise<void> => {
    if (!u.trim()) {
      setAuthType('password')
      return
    }
    const res = await window.electronAPI.auth.getAuthType(u.trim())
    if (res.success && res.data) setAuthType(res.data)
    else setAuthType('password')
  }

  useEffect(() => {
    const timer = setTimeout(() => { void resolveAuthType(username) }, 220)
    return () => clearTimeout(timer)
  }, [username])

  const submitLogin = async (secret: string): Promise<void> => {
    setError('')
    setIsLoading(true)
    try {
      const res = await window.electronAPI.auth.login({ username: username.trim(), password: secret })
      if (res.success && res.data) {
        setUser(res.data)
        navigate('/', { replace: true })
      } else {
        setError(t('auth.loginError'))
        setShake(true)
        setTimeout(() => setShake(false), 380)
        setPasscode('')
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmitPassword = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await submitLogin(password)
  }

  async function handleRequestReset(): Promise<void> {
    if (!requestUsername.trim()) {
      setRequestError('Enter your username')
      return
    }
    setRequestLoading(true)
    setRequestError('')
    try {
      const res = await window.electronAPI.auth.requestPasswordReset(requestUsername.trim())
      if (res?.success && res.data) {
        setRequestDoneMessage(res.data.message)
        setRequestSent(true)
      } else {
        setRequestError(res?.error ?? 'Failed to send request')
      }
    } catch {
      setRequestError('Failed to send request')
    } finally {
      setRequestLoading(false)
    }
  }

  async function handlePasswordReset(): Promise<void> {
    setResetError('')
    if (!resetCode.trim()) {
      setResetError('Enter the reset code')
      return
    }
    if (!resetUsername.trim()) {
      setResetError('Enter your username')
      return
    }
    if (resetPassword.length < 4) {
      setResetError('Password must be at least 4 characters')
      return
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match')
      return
    }
    setResetLoading(true)
    try {
      const res = await (
        window.electronAPI.auth as typeof window.electronAPI.auth & {
          resetPassword: (params: {
            code: string
            username: string
            newPassword: string
          }) => Promise<{ success: boolean; error?: string }>
        }
      ).resetPassword({
        code: resetCode.trim(),
        username: resetUsername.trim(),
        newPassword: resetPassword,
      })
      if (res?.success) {
        setResetSuccess(true)
      } else {
        setResetError(res?.error || 'Invalid reset code')
      }
    } catch {
      setResetError('Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  const onPressDigit = (d: string): void => {
    if (isLoading || !isPasscodeMode) return
    if (passcode.length >= passcodeLength) return
    const next = `${passcode}${d}`
    setPasscode(next)
    if (next.length === passcodeLength) {
      void submitLogin(next)
    }
  }

  const onBackspace = (): void => {
    if (isLoading || !isPasscodeMode) return
    setPasscode(prev => prev.slice(0, -1))
  }

  useEffect(() => {
    if (!isPasscodeMode) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        onPressDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        onBackspace()
      } else if (e.key === 'Enter' && passcode.length === passcodeLength) {
        e.preventDefault()
        void submitLogin(passcode)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPasscodeMode, passcode, passcodeLength, isLoading])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <style>{`
        @keyframes mg-shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
          100% { transform: translateX(0); }
        }
        .mg-shake { animation: mg-shake 0.36s ease-in-out; }
      `}</style>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-white">
          <h1 className="text-2xl font-bold">{appName}</h1>
          <p className="text-slate-400 text-sm mt-1">{appTagline || t('auth.welcome')}</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl shadow-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">{t('auth.login')}</h2>

          <form onSubmit={onSubmitPassword} className={cn('space-y-4', shake && 'mg-shake')}>
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('auth.username')}
              </label>
              <input
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setError('')
                  setPasscode('')
                }}
                className={cn(
                  'w-full px-3 py-2.5 rounded-md border bg-background text-foreground text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                  'border-input'
                )}
                placeholder={t('auth.username')}
              />
            </div>

            {!isPasscodeMode && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2.5 pe-10 rounded-md border bg-background text-foreground text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-ring transition-colors border-input'
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
              </div>
            )}

            {isPasscodeMode && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">
                  {authType === 'passcode_4' ? '4-digit passcode' : '6-digit passcode'}
                </label>
                <div className="flex items-center justify-center gap-2">
                  {Array.from({ length: passcodeLength }).map((_, idx) => (
                    <span
                      key={idx}
                      className={cn(
                        'w-3.5 h-3.5 rounded-full border border-border',
                        idx < passcode.length ? 'bg-primary border-primary' : 'bg-transparent'
                      )}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['1','2','3','4','5','6','7','8','9','','0','back'].map((k) => (
                    k === '' ? <div key="empty" /> : (
                      <button
                        key={k}
                        type="button"
                        onClick={() => (k === 'back' ? onBackspace() : onPressDigit(k))}
                        disabled={isLoading}
                        className="h-12 rounded-md border border-border bg-background text-foreground text-lg font-semibold hover:bg-accent disabled:opacity-60"
                      >
                        {k === 'back' ? <Delete className="w-5 h-5 mx-auto" /> : k}
                      </button>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            {/* Submit */}
            {!isPasscodeMode && (
              <button
                type="submit"
                disabled={isLoading || !canSubmit}
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
            )}
            {!isPasscodeMode && (
              <button
                type="button"
                onClick={() => {
                  setShowReset(true)
                  setResetError('')
                  setResetSuccess(false)
                  setResetMode('request')
                  setRequestSent(false)
                  setRequestUsername('')
                  setRequestDoneMessage('')
                  setRequestError('')
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                Forgot password?
              </button>
            )}
          </form>
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">

            {resetSuccess ? (
              <div className="text-center space-y-3">
                <div className="text-4xl">✅</div>
                <p className="font-semibold">
                  Password Reset Successfully
                </p>
                <p className="text-sm text-muted-foreground">
                  You can now login with
                  your new password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowReset(false)
                    setResetSuccess(false)
                    setResetCode('')
                    setResetPassword('')
                    setResetConfirm('')
                    setResetUsername('')
                  }}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    Reset Password
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowReset(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                  <button
                    type="button"
                    onClick={() => setResetMode('request')}
                    className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                      resetMode === 'request' ? 'bg-background shadow font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    Request Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetMode('code')}
                    className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                      resetMode === 'code' ? 'bg-background shadow font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    Use Reset Code
                  </button>
                </div>

                {resetMode === 'request' ? (
                  requestSent ? (
                    <div className="text-center space-y-3">
                      <div className="text-4xl">✅</div>
                      <p className="font-semibold text-sm">Request Sent!</p>
                      <p className="text-xs text-muted-foreground">{requestDoneMessage}</p>
                      <p className="text-xs text-muted-foreground">
                        You will be able to login with &quot;1234&quot; after your manager approves.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowReset(false)
                          setRequestSent(false)
                          setRequestUsername('')
                          setRequestDoneMessage('')
                        }}
                        className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
                      >
                        Back to Login
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Enter your username to request a password reset from your manager.
                      </p>
                      <input
                        type="text"
                        placeholder="Your username"
                        value={requestUsername}
                        onChange={e => {
                          setRequestUsername(e.target.value)
                          setRequestError('')
                        }}
                        className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {requestError ? <p className="text-xs text-destructive">{requestError}</p> : null}
                      <button
                        type="button"
                        onClick={() => void handleRequestReset()}
                        disabled={requestLoading}
                        className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
                      >
                        {requestLoading ? 'Sending...' : 'Send Reset Request'}
                      </button>
                    </div>
                  )
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Contact your system administrator
                      to get a reset code for your account.
                    </p>

                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Username"
                        value={resetUsername}
                        onChange={e => {
                          setResetUsername(e.target.value)
                          setResetError('')
                        }}
                        className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text"
                        placeholder="Reset code (MH-XXXXXX-XXXXXX)"
                        value={resetCode}
                        onChange={e => {
                          setResetCode(e.target.value.toUpperCase())
                          setResetError('')
                        }}
                        className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="password"
                        placeholder="New password"
                        value={resetPassword}
                        onChange={e => {
                          setResetPassword(e.target.value)
                          setResetError('')
                        }}
                        className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="password"
                        placeholder="Confirm new password"
                        value={resetConfirm}
                        onChange={e => {
                          setResetConfirm(e.target.value)
                          setResetError('')
                        }}
                        className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {resetError ? <p className="text-xs text-destructive">{resetError}</p> : null}

                    <button
                      type="button"
                      onClick={() => void handlePasswordReset()}
                      disabled={resetLoading}
                      className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {resetLoading ? 'Resetting...' : 'Reset Password'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
