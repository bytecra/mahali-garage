import { useEffect, useState } from 'react'
import Modal from '../../shared/Modal'
import { toast } from '../../../store/notificationStore'
import type { VehicleOption } from '../job-tabs/vehicleOption'

function mapRowToVehicleOption(row: Record<string, unknown>): VehicleOption {
  return {
    id: Number(row.id),
    make: String(row.make ?? ''),
    model: String(row.model ?? ''),
    year: row.year != null && row.year !== '' ? Number(row.year) : null,
    license_plate: row.license_plate != null ? String(row.license_plate) : null,
    vin: row.vin != null ? String(row.vin) : null,
    color: row.color != null ? String(row.color) : null,
    mileage: Number(row.mileage) || 0,
    owner_id: row.owner_id != null ? Number(row.owner_id) : null,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
  }
}

export default function AddCarModal(props: {
  open: boolean
  ownerId: number | null
  /** When set, modal updates this vehicle (plate, color, etc.) instead of creating a new one */
  vehicleToEdit: VehicleOption | null
  onClose: () => void
  onSaved: (vehicle: VehicleOption) => void
}): JSX.Element | null {
  const { open, ownerId, vehicleToEdit, onClose, onSaved } = props
  const isEdit = vehicleToEdit != null
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [plate, setPlate] = useState('')
  const [color, setColor] = useState('')
  const [vin, setVin] = useState('')
  const [mileage, setMileage] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (vehicleToEdit) {
      void (async () => {
        const res = await window.electronAPI.vehicles.getById(vehicleToEdit.id)
        if (!res.success || !res.data) {
          toast.error('Could not load vehicle')
          return
        }
        const d = res.data as Record<string, unknown>
        setMake(String(d.make ?? ''))
        setModel(String(d.model ?? ''))
        setYear(d.year != null && d.year !== '' ? String(d.year) : '')
        setPlate(String(d.license_plate ?? ''))
        setColor(String(d.color ?? ''))
        setVin(String(d.vin ?? ''))
        setMileage(String(d.mileage ?? 0))
      })()
    } else {
      setMake('')
      setModel('')
      setYear('')
      setPlate('')
      setColor('')
      setVin('')
      setMileage('0')
    }
  }, [open, vehicleToEdit?.id])

  const handleClose = (): void => {
    if (!saving) onClose()
  }

  const save = async (): Promise<void> => {
    if (!isEdit && !ownerId) {
      toast.error('Select a customer first')
      return
    }
    const mk = make.trim()
    const md = model.trim()
    if (!mk || !md) {
      toast.error('Make and model are required')
      return
    }
    setSaving(true)
    try {
      if (isEdit && vehicleToEdit) {
        const res = await window.electronAPI.vehicles.update(vehicleToEdit.id, {
          make: mk,
          model: md,
          year: year.trim() ? Number(year) : null,
          license_plate: plate.trim() || null,
          color: color.trim() || null,
          vin: vin.trim() || null,
          mileage: Number(mileage) || 0,
        })
        setSaving(false)
        if (!res.success) {
          toast.error((res as { error?: string }).error ?? 'Failed to update vehicle')
          return
        }
        const fresh = await window.electronAPI.vehicles.getById(vehicleToEdit.id)
        if (!fresh.success || !fresh.data) {
          toast.error('Saved but could not reload vehicle')
          return
        }
        toast.success('Vehicle updated')
        onSaved(mapRowToVehicleOption(fresh.data as Record<string, unknown>))
        onClose()
        return
      }

      const res = await window.electronAPI.vehicles.create({
        owner_id: ownerId!,
        make: mk,
        model: md,
        year: year.trim() ? Number(year) : null,
        license_plate: plate.trim() || null,
        vin: vin.trim() || null,
        color: color.trim() || null,
        mileage: Number(mileage) || 0,
        engine_type: null,
        transmission: null,
        insurance_company: null,
        insurance_policy: null,
        insurance_expiry: null,
        notes: null,
      })
      setSaving(false)
      if (!res.success || !res.data) {
        toast.error((res as { error?: string }).error ?? 'Failed')
        return
      }
      const id = (res.data as { id: number }).id
      const loaded = await window.electronAPI.vehicles.getById(id)
      if (loaded.success && loaded.data) {
        toast.success('Vehicle added')
        onSaved(mapRowToVehicleOption(loaded.data as Record<string, unknown>))
        onClose()
        return
      }
      toast.success('Vehicle added')
      onSaved({
        id,
        make: mk,
        model: md,
        year: year.trim() ? Number(year) : null,
        license_plate: plate.trim() || null,
        vin: vin.trim() || null,
        color: color.trim() || null,
        mileage: Number(mileage) || 0,
        owner_id: ownerId,
        owner_name: null,
      })
      onClose()
    } catch {
      setSaving(false)
      toast.error(isEdit ? 'Failed to update vehicle' : 'Failed to add vehicle')
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background'

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit vehicle' : 'New vehicle'}
      onClose={handleClose}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (!isEdit && !ownerId)}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!isEdit && !ownerId && (
          <p className="text-sm text-amber-600 dark:text-amber-400">Select a customer in the Customer tab first.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Make *</label>
            <input className={inputCls} value={make} onChange={e => setMake(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Model *</label>
            <input className={inputCls} value={model} onChange={e => setModel(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Year</label>
            <input
              className={inputCls}
              type="number"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="2024"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">License plate</label>
            <input className={inputCls} value={plate} onChange={e => setPlate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <input className={inputCls} value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. White" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mileage (km)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={mileage}
              onChange={e => setMileage(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">VIN</label>
          <input className={`${inputCls} font-mono text-xs`} value={vin} onChange={e => setVin(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
