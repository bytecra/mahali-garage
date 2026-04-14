import { useEffect, useMemo, useState } from 'react'
import { toast } from '../../store/notificationStore'

export default function JobNumberSettings(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'standard' | 'numeric'>('standard')
  const [prefix, setPrefix] = useState('JOB')
  const [includeYear, setIncludeYear] = useState(true)
  const [padding, setPadding] = useState(4)
  const [yearlyReset, setYearlyReset] = useState(true)
  const [nextNumber, setNextNumber] = useState('1')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await window.electronAPI.settings.getAll()
      setLoading(false)
      if (!res.success || !res.data) return
      const s = res.data as Record<string, string>
      const m = s['job_card.number.mode'] === 'numeric' ? 'numeric' : 'standard'
      setMode(m)
      setPrefix((s['job_card.number.prefix'] ?? 'JOB').trim() || 'JOB')
      setIncludeYear(s['job_card.number.include_year'] !== '0')
      setPadding(Math.min(12, Math.max(1, parseInt(s['job_card.number.padding'] ?? '4', 10) || 4)))
      setYearlyReset(s['job_card.number.yearly_reset'] !== '0')
      setNextNumber(s['job_card.next_number'] ?? '1')
    })()
  }, [])

  const preview = useMemo(() => {
    const y = new Date().getFullYear()
    const padN = Math.min(12, Math.max(1, padding || 4))
    const seq = String(Math.max(1, parseInt(nextNumber, 10) || 1)).padStart(padN, '0')
    if (mode === 'numeric') return seq
    const pfx = (prefix || 'JOB').replace(/-+$/, '')
    return includeYear ? `${pfx}-${y}-${seq}` : `${pfx}-${seq}`
  }, [mode, prefix, includeYear, padding, nextNumber])

  const save = async (): Promise<void> => {
    setSaving(true)
    const res = await window.electronAPI.settings.setBulk({
      'job_card.number.mode': mode,
      'job_card.number.prefix': prefix.trim() || 'JOB',
      'job_card.number.include_year': includeYear ? '1' : '0',
      'job_card.number.padding': String(Math.min(12, Math.max(1, padding))),
      'job_card.number.yearly_reset': yearlyReset ? '1' : '0',
      'job_card.next_number': String(Math.max(1, parseInt(nextNumber, 10) || 1)),
    })
    setSaving(false)
    if (res.success) toast.success('Job number settings saved')
    else toast.error(res.error ?? 'Could not save')
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-4 mb-8 bg-muted/10">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Job card numbers</h3>
        <p className="text-xs text-muted-foreground mt-1">
          New jobs get the next number from this sequence. Existing job numbers are not changed.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Format</label>
          <select
            className="w-full border border-input rounded-md px-2 py-1.5 bg-background text-sm"
            value={mode}
            onChange={e => setMode(e.target.value === 'numeric' ? 'numeric' : 'standard')}
          >
            <option value="standard">Prefix and sequence (e.g. JOB-2026-0001)</option>
            <option value="numeric">Numbers only (e.g. 0001)</option>
          </select>
        </div>
        {mode === 'standard' ? (
          <div>
            <label className="block text-xs font-medium mb-1">Prefix (letters / short code)</label>
            <input
              className="w-full border border-input rounded-md px-2 py-1.5 bg-background text-sm font-mono"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="JOB"
            />
          </div>
        ) : (
          <div />
        )}
      </div>

      {mode === 'standard' && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={includeYear}
            onChange={e => setIncludeYear(e.target.checked)}
          />
          Include calendar year in the job number
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Sequence width (digits)</label>
          <input
            type="number"
            min={1}
            max={12}
            className="w-full border border-input rounded-md px-2 py-1.5 bg-background text-sm"
            value={padding}
            onChange={e => setPadding(parseInt(e.target.value, 10) || 4)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Next sequence value</label>
          <input
            type="number"
            min={1}
            className="w-full border border-input rounded-md px-2 py-1.5 bg-background text-sm"
            value={nextNumber}
            onChange={e => setNextNumber(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Used for the next new job you create.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-primary"
          checked={yearlyReset}
          onChange={e => setYearlyReset(e.target.checked)}
        />
        Reset sequence every calendar year (first job in a new year starts from “Next sequence value”, usually 1)
      </label>

      <p className="text-xs rounded-md bg-muted/50 border border-border px-3 py-2 font-mono">
        Preview: <span className="text-foreground font-semibold">{preview}</span>
      </p>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save job number settings'}
      </button>
    </div>
  )
}
