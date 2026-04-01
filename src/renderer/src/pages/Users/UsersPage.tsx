import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Shield, KeyRound, RotateCcw } from 'lucide-react'
import { usePermission } from '../../hooks/usePermission'
import { useAuthStore } from '../../store/authStore'
import { toast } from '../../store/notificationStore'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'

interface UserRow {
  id: number; username: string; full_name: string; role: string
  is_active: number; created_at: string; override_count: number
  auth_type?: 'password' | 'passcode_4' | 'passcode_6'
}

interface Override { key: string; granted: boolean; description: string | null }

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', cashier: 'Cashier',
  technician: 'Technician', accountant: 'Accountant',
}

const ROLE_COLORS: Record<string, string> = {
  owner:      'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  manager:    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  cashier:    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  technician: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  accountant: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
}

// Grouped permission keys with human-readable labels
const PERM_GROUPS: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  { group: 'permissions.groups.sales', items: [
    { key: 'sales.view',          label: 'permissions.keys.sales.view' },
    { key: 'sales.create',        label: 'permissions.keys.sales.create' },
    { key: 'sales.void',          label: 'permissions.keys.sales.void' },
    { key: 'sales.discount',      label: 'permissions.keys.sales.discount' },
    { key: 'invoices.edit',       label: 'permissions.keys.invoices.edit' },
  ]},
  { group: 'permissions.groups.inventory', items: [
    { key: 'inventory.view',         label: 'permissions.keys.inventory.view' },
    { key: 'inventory.edit',         label: 'permissions.keys.inventory.edit' },
    { key: 'inventory.delete',       label: 'permissions.keys.inventory.delete' },
    { key: 'inventory.adjust_stock', label: 'permissions.keys.inventory.adjust_stock' },
    { key: 'products.update_price',  label: 'permissions.keys.products.update_price' },
  ]},
  { group: 'permissions.groups.customers', items: [
    { key: 'customers.view',   label: 'permissions.keys.customers.view' },
    { key: 'customers.edit',   label: 'permissions.keys.customers.edit' },
    { key: 'customers.delete', label: 'permissions.keys.customers.delete' },
  ]},
  { group: 'permissions.groups.repairs', items: [
    { key: 'repairs.view',         label: 'permissions.keys.repairs.view' },
    { key: 'repairs.edit',         label: 'permissions.keys.repairs.edit' },
    { key: 'repairs.updateStatus', label: 'permissions.keys.repairs.updateStatus' },
    { key: 'repairs.delete',       label: 'permissions.keys.repairs.delete' },
  ]},
  { group: 'permissions.groups.reports', items: [
    { key: 'reports.view',      label: 'permissions.keys.reports.view' },
    { key: 'reports.export',    label: 'permissions.keys.reports.export' },
    { key: 'reports.financial', label: 'permissions.keys.reports.financial' },
    { key: 'reports.employee',  label: 'permissions.keys.reports.employee' },
  ]},
  { group: 'permissions.groups.expenses', items: [
    { key: 'expenses.view',              label: 'permissions.keys.expenses.view' },
    { key: 'expenses.add',               label: 'permissions.keys.expenses.add' },
    { key: 'expenses.delete',            label: 'permissions.keys.expenses.delete' },
    { key: 'expenses.manage_categories', label: 'permissions.keys.expenses.manage_categories' },
  ]},
  { group: 'permissions.groups.assets', items: [
    { key: 'assets.view',   label: 'permissions.keys.assets.view' },
    { key: 'assets.add',    label: 'permissions.keys.assets.add' },
    { key: 'assets.delete', label: 'permissions.keys.assets.delete' },
  ]},
  { group: 'permissions.groups.admin', items: [
    { key: 'users.manage',      label: 'permissions.keys.users.manage' },
    { key: 'settings.manage',   label: 'permissions.keys.settings.manage' },
    { key: 'backup.manage',     label: 'permissions.keys.backup.manage' },
    { key: 'activity_log.view', label: 'permissions.keys.activity_log.view' },
  ]},
]

// ── Main page ──────────────────────────────────────────────────────────────────

export default function UsersPage(): JSX.Element {
  const { t } = useTranslation()
  const canManage = usePermission('users.manage')
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [permsUser, setPermsUser] = useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [pwdUser, setPwdUser] = useState<UserRow | null>(null)
  const [canAddUser, setCanAddUser] = useState(true)
  const [maxUsers, setMaxUsers] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await window.electronAPI.users.list()
    if (res.success) setUsers((res.data as { rows: UserRow[] }).rows)
    setLoading(false)

    try {
      const [infoRes, canRes] = await Promise.all([
        window.electronAPI.license.getInfo?.(),
        window.electronAPI.license.canAddUser?.(),
      ])
      if (infoRes && infoRes.success && infoRes.data) {
        const info = infoRes.data as { maxUsers?: number }
        if (typeof info.maxUsers === 'number') setMaxUsers(info.maxUsers)
      }
      if (canRes && canRes.success) {
        setCanAddUser(Boolean(canRes.data))
      }
    } catch {
      // fail open: allow adding
      setCanAddUser(true)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.users.delete(deleteTarget.id)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success(t('common.success'))
    setDeleteTarget(null)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('users.title')}</h1>
        {canManage && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => { if (canAddUser) { setEditUser(null); setFormOpen(true) } }}
              disabled={!canAddUser}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {canAddUser ? t('users.addUser') : 'Upgrade to add more users'}
            </button>
            {maxUsers !== null && (
              <p className="text-xs text-muted-foreground">
                {maxUsers === -1
                  ? 'Your plan allows unlimited users'
                  : maxUsers === 1
                  ? 'Your plan allows 1 user'
                  : `Your plan allows up to ${maxUsers} users`}
              </p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-medium">{t('common.name')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('auth.username')}</th>
                <th className="text-start px-4 py-3 font-medium">{t('users.role')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('common.status')}</th>
                {canManage && <th className="text-end px-4 py-3 font-medium">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.username}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-muted text-muted-foreground'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                      {u.override_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          <Shield className="w-2.5 h-2.5" />
                          {u.override_count} {t('permissions.override.overridesBadge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${u.is_active ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {u.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPermsUser(u)} title={t('users.permissions')}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setPwdUser(u)} title="Reset Password"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditUser(u); setFormOpen(true) }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-xs">
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal open={formOpen} user={editUser}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }} />

      {permsUser && (
        <PermissionsModal user={permsUser}
          onClose={() => { setPermsUser(null); load() }} />
      )}

      {pwdUser && <PasswordResetModal user={pwdUser} onClose={() => setPwdUser(null)} />}

      <ConfirmDialog open={!!deleteTarget} title={t('common.delete')}
        message={`Delete user "${deleteTarget?.full_name}"?`}
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}

// ── Permissions Modal ──────────────────────────────────────────────────────────

function PermissionsModal({ user, onClose }: { user: UserRow; onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const { user: currentUser } = useAuthStore()
  const [roleDefaults, setRoleDefaults] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [busy, setBusy] = useState<string | null>(null)   // key currently being toggled
  const [loadingData, setLoadingData] = useState(true)

  const isSelf = currentUser?.id === user.id
  const isOwner = user.role === 'owner'
  const viewOnly = isSelf || (isOwner && currentUser?.role !== 'owner')

  const loadData = useCallback(async () => {
    const [defRes, ovRes] = await Promise.all([
      window.electronAPI.users.getRoleDefaults(user.role),
      window.electronAPI.users.getUserOverrides(user.id),
    ])
    if (defRes.success) setRoleDefaults(defRes.data as string[])
    if (ovRes.success) setOverrides(ovRes.data as Override[])
    setLoadingData(false)
  }, [user.id, user.role])

  useEffect(() => { loadData() }, [loadData])

  // Determine visual state of a permission key
  const getState = (key: string): 'role-granted' | 'override-granted' | 'override-revoked' | 'not-granted' => {
    const inDefault = roleDefaults.includes(key)
    const ov = overrides.find(o => o.key === key)
    if (!ov) return inDefault ? 'role-granted' : 'not-granted'
    return ov.granted ? 'override-granted' : 'override-revoked'
  }

  const isEffective = (key: string): boolean => {
    const s = getState(key)
    return s === 'role-granted' || s === 'override-granted'
  }

  const handleToggle = async (key: string) => {
    if (viewOnly || busy) return
    const inDefault = roleDefaults.includes(key)
    const ov = overrides.find(o => o.key === key)
    const granted = isEffective(key)

    setBusy(key)
    let res
    if (granted) {
      // Revoking
      if (inDefault && (!ov || ov.granted)) {
        res = await window.electronAPI.users.setOverride(user.id, key, false)
      } else if (!inDefault && ov?.granted) {
        res = await window.electronAPI.users.removeOverride(user.id, key)
      }
    } else {
      // Granting
      if (inDefault && ov?.granted === false) {
        res = await window.electronAPI.users.removeOverride(user.id, key)  // restore default
      } else if (!inDefault) {
        res = await window.electronAPI.users.setOverride(user.id, key, true)
      }
    }

    if (res && !res.success) toast.error(res.error ?? t('common.error'))
    await loadData()
    setBusy(null)
  }

  const handleReset = async (key: string) => {
    if (viewOnly || busy) return
    setBusy(key)
    const res = await window.electronAPI.users.removeOverride(user.id, key)
    if (!res.success) toast.error(res.error ?? t('common.error'))
    await loadData()
    setBusy(null)
  }

  const overrideCount = overrides.length

  return (
    <Modal open title={`${t('users.permissions')} — ${user.full_name}`} onClose={onClose} size="lg"
      footer={
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
          {t('common.close')}
        </button>
      }
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role] ?? 'bg-muted text-muted-foreground'}`}>
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        {overrideCount > 0 ? (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <Shield className="w-3 h-3" />
            {overrideCount} {t('permissions.override.customOverrides')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('permissions.override.noOverrides')}</span>
        )}
        {viewOnly && (
          <span className="ms-auto text-xs text-muted-foreground italic">{t('permissions.override.viewOnly')}</span>
        )}
      </div>

      {loadingData ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : (
        <div className="space-y-5 max-h-[60vh] overflow-y-auto">
          {PERM_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                {t(group)}
              </h4>
              <div className="space-y-1.5">
                {items.map(({ key, label }) => {
                  const state = getState(key)
                  const effective = state === 'role-granted' || state === 'override-granted'
                  const isOverridden = state === 'override-granted' || state === 'override-revoked'
                  const isBusy = busy === key

                  return (
                    <div key={key} className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors ${
                      isOverridden ? (state === 'override-granted' ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30') : 'hover:bg-muted/40'
                    }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Toggle switch */}
                        <button
                          onClick={() => handleToggle(key)}
                          disabled={viewOnly || isBusy}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                            isBusy ? 'opacity-50 cursor-wait' :
                            viewOnly ? 'cursor-default opacity-70' : 'cursor-pointer'
                          } ${effective ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${effective ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">{t(label)}</p>
                          <p className="text-xs text-muted-foreground font-mono">{key}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ms-2 shrink-0">
                        {/* State badge */}
                        {state === 'role-granted' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {t('permissions.override.roleDefault')}
                          </span>
                        )}
                        {state === 'override-granted' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium">
                            ↑ {t('permissions.override.customGrant')}
                          </span>
                        )}
                        {state === 'override-revoked' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 font-medium">
                            ↓ {t('permissions.override.customRevoke')}
                          </span>
                        )}

                        {/* Reset to default button */}
                        {isOverridden && !viewOnly && (
                          <button onClick={() => handleReset(key)} disabled={!!busy}
                            title={t('permissions.override.resetToDefault')}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── User Form Modal ────────────────────────────────────────────────────────────

function UserFormModal({ open, user, onClose, onSaved }: {
  open: boolean; user: UserRow | null; onClose: () => void; onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    username: '',
    password: '',
    new_password: '',
    full_name: '',
    role: 'cashier',
    is_active: true,
    auth_type: 'password' as 'password' | 'passcode_4' | 'passcode_6',
    passcode: '',
    passcode_confirm: '',
  })
  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (user) setForm({
      username: user.username,
      password: '',
      new_password: '',
      full_name: user.full_name,
      role: user.role,
      is_active: Boolean(user.is_active),
      auth_type: user.auth_type ?? 'password',
      passcode: '',
      passcode_confirm: '',
    })
    else setForm({
      username: '',
      password: '',
      new_password: '',
      full_name: '',
      role: 'cashier',
      is_active: true,
      auth_type: 'password',
      passcode: '',
      passcode_confirm: '',
    })
  }, [open, user])

  const handleSave = async () => {
    if (!form.full_name || !form.username) { toast.error('Name and username are required'); return }
    if (!user && form.auth_type === 'password' && !form.password) { toast.error('Password is required'); return }
    if (form.auth_type !== 'password') {
      const len = form.auth_type === 'passcode_4' ? 4 : 6
      if (!/^\d+$/.test(form.passcode) || form.passcode.length !== len) {
        toast.error(`Passcode must be exactly ${len} digits`)
        return
      }
      if (form.passcode !== form.passcode_confirm) {
        toast.error('Passcode confirmation does not match')
        return
      }
    }
    setSaving(true)
    if (user) {
      const res = await window.electronAPI.users.update(user.id, {
        full_name: form.full_name,
        role: form.role,
        is_active: form.is_active,
        new_password: form.auth_type === 'password' && form.new_password ? form.new_password : undefined,
      })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
      const authRes = await window.electronAPI.users.setAuth(user.id, {
        auth_type: form.auth_type,
        passcode: form.auth_type === 'password' ? null : form.passcode,
      })
      if (!authRes.success) { toast.error(authRes.error ?? t('common.error')); return }
    } else {
      const initialPassword = form.auth_type === 'password' ? form.password : `${Date.now()}-tmp`
      const res = await window.electronAPI.users.create({
        username: form.username,
        password: initialPassword,
        full_name: form.full_name,
        role: form.role,
      })
      setSaving(false)
      if (!res.success) { toast.error(res.error ?? t('common.error')); return }
      const userId = Number(res.data)
      if (form.auth_type !== 'password') {
        const authRes = await window.electronAPI.users.setAuth(userId, { auth_type: form.auth_type, passcode: form.passcode })
        if (!authRes.success) { toast.error(authRes.error ?? t('common.error')); return }
      }
    }
    toast.success(t('common.success'))
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Modal open={open} title={user ? t('users.editUser') : t('users.addUser')} onClose={onClose} size="sm"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div><label className="block text-sm font-medium mb-1">{t('users.fullName')}</label>
          <input value={form.full_name} onChange={e => set('full_name', e.target.value)} className={inputCls} /></div>
        {!user && <div><label className="block text-sm font-medium mb-1">{t('auth.username')}</label>
          <input value={form.username} onChange={e => set('username', e.target.value)} className={inputCls} /></div>}
        <div>
          <label className="block text-sm font-medium mb-1">Authentication</label>
          <select value={form.auth_type} onChange={e => set('auth_type', e.target.value as typeof form.auth_type)} className={inputCls}>
            <option value="password">Password</option>
            <option value="passcode_4">4-digit Passcode</option>
            <option value="passcode_6">6-digit Passcode</option>
          </select>
        </div>
        {!user && form.auth_type === 'password' && (
          <div><label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} /></div>
        )}
        {user && form.auth_type === 'password' && (
          <div><label className="block text-sm font-medium mb-1">New Password (optional)</label>
            <input type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} className={inputCls} /></div>
        )}
        {form.auth_type !== 'password' && (
          <>
            <div><label className="block text-sm font-medium mb-1">{form.auth_type === 'passcode_4' ? '4-digit passcode' : '6-digit passcode'}</label>
              <div className="flex items-center gap-2 mb-2">
                {Array.from({ length: form.auth_type === 'passcode_4' ? 4 : 6 }).map((_, i) => (
                  <span key={i} className={`w-3.5 h-3.5 rounded-sm border ${i < form.passcode.length ? 'bg-primary border-primary' : 'border-border bg-transparent'}`} />
                ))}
              </div>
              <input
                inputMode="numeric"
                maxLength={form.auth_type === 'passcode_4' ? 4 : 6}
                value={form.passcode}
                onChange={e => set('passcode', e.target.value.replace(/\D/g, ''))}
                className={inputCls}
                placeholder={form.auth_type === 'passcode_4' ? '1234' : '123456'}
              />
            </div>
            <div><label className="block text-sm font-medium mb-1">Confirm passcode</label>
              <div className="flex items-center gap-2 mb-2">
                {Array.from({ length: form.auth_type === 'passcode_4' ? 4 : 6 }).map((_, i) => (
                  <span key={i} className={`w-3.5 h-3.5 rounded-sm border ${i < form.passcode_confirm.length ? 'bg-primary border-primary' : 'border-border bg-transparent'}`} />
                ))}
              </div>
              <input
                inputMode="numeric"
                maxLength={form.auth_type === 'passcode_4' ? 4 : 6}
                value={form.passcode_confirm}
                onChange={e => set('passcode_confirm', e.target.value.replace(/\D/g, ''))}
                className={inputCls}
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">{t('users.role')}</label>
          <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {user && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">{t('common.active')}</span>
          </label>
        )}
      </div>
    </Modal>
  )
}

// ── Password Reset Modal ───────────────────────────────────────────────────────

function PasswordResetModal({ user, onClose }: { user: UserRow; onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [pwd, setPwd] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!pwd || pwd.length < 4) { toast.error('Password must be at least 4 characters'); return }
    setSaving(true)
    const res = await window.electronAPI.users.resetPassword(user.id, pwd)
    setSaving(false)
    if (!res.success) { toast.error(res.error ?? t('common.error')); return }
    toast.success('Password reset successfully')
    onClose()
  }

  return (
    <Modal open title={`Reset Password — ${user.full_name}`} onClose={onClose} size="sm"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? t('common.loading') : 'Reset'}
          </button>
        </>
      }
    >
      <div>
        <label className="block text-sm font-medium mb-1">New Password</label>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus
          className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
    </Modal>
  )
}
