import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Car, Pencil, Trash2 } from 'lucide-react'
import SearchInput from '../../components/shared/SearchInput'
import Pagination from '../../components/shared/Pagination'
import EmptyState from '../../components/shared/EmptyState'
import Modal from '../../components/shared/Modal'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { FeatureGate } from '../../components/FeatureGate'
import { usePermission } from '../../hooks/usePermission'
import { useDebounce } from '../../hooks/useDebounce'
import { toast } from '../../store/notificationStore'

interface Vehicle {
  id: number; make: string; model: string; year: number | null
  license_plate: string | null; vin: string | null; color: string | null
  mileage: number; owner_name: string | null; owner_id: number | null
  engine_type: string | null; transmission: string | null
  insurance_company: string | null; insurance_expiry: string | null
}

interface VehicleFormData {
  owner_id: number | null; make: string; model: string; year: string
  vin: string; license_plate: string; color: string; mileage: string
  engine_type: string; transmission: string
  insurance_company: string; insurance_policy: string; insurance_expiry: string; notes: string
}

const emptyForm: VehicleFormData = {
  owner_id: null, make: '', model: '', year: '', vin: '', license_plate: '', color: '',
  mileage: '0', engine_type: '', transmission: '', insurance_company: '', insurance_policy: '',
  insurance_expiry: '', notes: '',
}

function VehiclesInner(): JSX.Element {
  const { t } = useTranslation()
  const canEdit = usePermission('customers.edit')
  const canDelete = usePermission('customers.delete')

  const [items, setItems] = useState<Vehicle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<VehicleFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null)
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.vehicles.list({ search: dSearch, page })
    if (res.success) {
      const d = res.data as { items: Vehicle[]; total: number }
      setItems(d.items); setTotal(d.total)
    }
    setLoading(false)
  }, [dSearch, page])

  useEffect(() => { setPage(1) }, [dSearch])
  useEffect(() => { load() }, [load])

  const openCreate = async () => {
    setEditId(null); setForm(emptyForm)
    const res = await window.electronAPI.customers.list({ pageSize: 200 })
    if (res.success) setOwners((res.data as { items: { id: number; name: string }[] }).items)
    setFormOpen(true)
  }

  const openEdit = async (v: Vehicle) => {
    setEditId(v.id)
    const res = await window.electronAPI.vehicles.getById(v.id)
    if (!res.success) { toast.error(t('common.error')); return }
    const d = res.data as Record<string, unknown>
    setForm({
      owner_id: d.owner_id as number | null, make: d.make as string, model: d.model as string,
      year: String(d.year ?? ''), vin: (d.vin as string) ?? '', license_plate: (d.license_plate as string) ?? '',
      color: (d.color as string) ?? '', mileage: String(d.mileage ?? 0),
      engine_type: (d.engine_type as string) ?? '', transmission: (d.transmission as string) ?? '',
      insurance_company: (d.insurance_company as string) ?? '', insurance_policy: (d.insurance_policy as string) ?? '',
      insurance_expiry: (d.insurance_expiry as string) ?? '', notes: (d.notes as string) ?? '',
    })
    const ownerRes = await window.electronAPI.customers.list({ pageSize: 200 })
    if (ownerRes.success) setOwners((ownerRes.data as { items: { id: number; name: string }[] }).items)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.make || !form.model) { toast.error('Make and Model are required'); return }
    setSaving(true)
    const payload = {
      ...form,
      year: form.year ? Number(form.year) : null,
      mileage: Number(form.mileage) || 0,
    }
    const res = editId
      ? await window.electronAPI.vehicles.update(editId, payload)
      : await window.electronAPI.vehicles.create(payload)
    setSaving(false)
    if (res.success) { toast.success(t('common.success')); setFormOpen(false); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await window.electronAPI.vehicles.delete(deleteTarget.id)
    if (res.success) { toast.success(t('common.success')); setDeleteTarget(null); load() }
    else toast.error(res.error ?? t('common.error'))
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('nav.vehicles')}</h1>
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" />Add Vehicle
          </button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search vehicles..." className="w-72" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Car} title="No vehicles found" description="Add your first vehicle to get started." />
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Vehicle</th>
                  <th className="text-start px-4 py-3 font-medium">Plate</th>
                  <th className="text-start px-4 py-3 font-medium">Owner</th>
                  <th className="text-center px-4 py-3 font-medium">Year</th>
                  <th className="text-end px-4 py-3 font-medium">Mileage</th>
                  <th className="text-end px-4 py-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(v => (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{v.make} {v.model}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{v.license_plate ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.owner_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{v.year ?? '—'}</td>
                    <td className="px-4 py-3 text-end text-muted-foreground">{v.mileage?.toLocaleString()} km</td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>}
                        {canDelete && <button onClick={() => setDeleteTarget(v)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={25} total={total} onChange={setPage} />
        </>
      )}

      <Modal open={formOpen} title={editId ? 'Edit Vehicle' : 'Add Vehicle'} onClose={() => setFormOpen(false)} size="lg"
        footer={<>
          <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">{saving ? t('common.loading') : t('common.save')}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Make *</label><input value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} className={inputCls} placeholder="e.g. Toyota" /></div>
          <div><label className="block text-sm font-medium mb-1">Model *</label><input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className={inputCls} placeholder="e.g. Camry" /></div>
          <div><label className="block text-sm font-medium mb-1">Year</label><input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className={inputCls} placeholder="2024" /></div>
          <div><label className="block text-sm font-medium mb-1">License Plate</label><input value={form.license_plate} onChange={e => setForm(f => ({ ...f, license_plate: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-sm font-medium mb-1">VIN</label><input value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-sm font-medium mb-1">Color</label><input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-sm font-medium mb-1">Mileage (km)</label><input type="number" value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-sm font-medium mb-1">Owner</label>
            <select value={form.owner_id ?? ''} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value ? Number(e.target.value) : null }))} className={inputCls}>
              <option value="">— None —</option>
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Engine Type</label><input value={form.engine_type} onChange={e => setForm(f => ({ ...f, engine_type: e.target.value }))} className={inputCls} placeholder="e.g. V6 3.5L" /></div>
          <div><label className="block text-sm font-medium mb-1">Transmission</label>
            <select value={form.transmission} onChange={e => setForm(f => ({ ...f, transmission: e.target.value }))} className={inputCls}>
              <option value="">—</option>
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
              <option value="cvt">CVT</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Insurance Company</label><input value={form.insurance_company} onChange={e => setForm(f => ({ ...f, insurance_company: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-sm font-medium mb-1">Insurance Expiry</label><input type="date" value={form.insurance_expiry} onChange={e => setForm(f => ({ ...f, insurance_expiry: e.target.value }))} className={inputCls} /></div>
          <div className="col-span-2"><label className="block text-sm font-medium mb-1">{t('common.notes')}</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} /></div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title={t('common.delete')}
        message={`Delete ${deleteTarget?.make} ${deleteTarget?.model} (${deleteTarget?.license_plate ?? 'no plate'})? This cannot be undone.`}
        confirmLabel={t('common.delete')} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}

export default function VehiclesPage(): JSX.Element {
  return (
    <FeatureGate feature="vehicles.view">
      <VehiclesInner />
    </FeatureGate>
  )
}
