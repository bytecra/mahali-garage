import { type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { InspectionMarker, InspectionMarkerType } from './carInspectionTypes'

const INSPECTION_VB_W = 200
const INSPECTION_VB_H = 350

function markerFill(type: InspectionMarkerType): string {
  if (type === 'scratch') return '#ef4444'
  if (type === 'dent') return '#f97316'
  if (type === 'broken') return '#1e293b'
  return '#eab308'
}

function CarTopViewSvg(props: {
  markers: InspectionMarker[]
  onAddMarker: (x: number, y: number) => void
  onRemoveMarker: (index: number) => void
}): JSX.Element {
  const { markers, onAddMarker, onRemoveMarker } = props

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>): void {
    const target = e.target as Element | null
    if (target?.closest?.('[data-inspection-marker]')) return

    const svg = e.currentTarget
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    const xPct = Math.round(Math.max(0, Math.min(100, (p.x / INSPECTION_VB_W) * 100)) * 10) / 10
    const yPct = Math.round(Math.max(0, Math.min(100, (p.y / INSPECTION_VB_H) * 100)) * 10) / 10
    onAddMarker(xPct, yPct)
  }

  return (
    <svg
      viewBox={`0 0 ${INSPECTION_VB_W} ${INSPECTION_VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-auto max-h-48 max-w-[160px] text-foreground cursor-crosshair select-none"
      onClick={handleSvgClick}
    >
      <rect x="40" y="60" width="120" height="230" rx="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="55" y="75" width="90" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="55" y="225" width="90" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="30" width="100" height="35" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="285" width="100" height="35" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="55" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="160" y="55" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="250" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="160" y="250" width="25" height="45" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="40" y1="175" x2="160" y2="175" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
      <rect x="43" y="148" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="143" y="148" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="43" y="195" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="143" y="195" width="14" height="5" rx="2" fill="currentColor" opacity="0.4" />
      <text x="100" y="22" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">
        FRONT
      </text>
      <text x="100" y="338" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">
        REAR
      </text>

      {markers.map((marker, i) => {
        const cx = (marker.x / 100) * INSPECTION_VB_W
        const cy = (marker.y / 100) * INSPECTION_VB_H
        const fill = markerFill(marker.type)
        return (
          <g
            key={i}
            data-inspection-marker
            className="cursor-pointer"
            onClick={ev => {
              ev.stopPropagation()
              onRemoveMarker(i)
            }}
          >
            <circle cx={cx} cy={cy} r="8" fill={fill} stroke="white" strokeWidth="1.5" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold" pointerEvents="none">
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function CarInspectionPanel(props: {
  showInspection: boolean
  setShowInspection: Dispatch<SetStateAction<boolean>>
  inspectionMarkers: InspectionMarker[]
  setInspectionMarkers: Dispatch<SetStateAction<InspectionMarker[]>>
  inspectionNotes: string
  setInspectionNotes: Dispatch<SetStateAction<string>>
  selectedMarkerType: InspectionMarkerType
  setSelectedMarkerType: Dispatch<SetStateAction<InspectionMarkerType>>
}): JSX.Element {
  const { t } = useTranslation()
  const {
    showInspection,
    setShowInspection,
    inspectionMarkers,
    setInspectionMarkers,
    inspectionNotes,
    setInspectionNotes,
    selectedMarkerType,
    setSelectedMarkerType,
  } = props

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setShowInspection(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          🚗 Car Inspection Diagram
          {inspectionMarkers.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
              {inspectionMarkers.length} mark{inspectionMarkers.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span className="text-muted-foreground">{showInspection ? '▲' : '▼'}</span>
      </button>

      {showInspection && (
        <div className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ['scratch', '🔴', 'Scratch'],
                ['dent', '🟠', 'Dent'],
                ['broken', '⚫', 'Broken'],
                ['other', '🟡', 'Other'],
              ] as const
            ).map(([type, emoji, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedMarkerType(type)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  selectedMarkerType === type
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {emoji} {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {t('customReceipts.inspectionHint', { defaultValue: 'Click on the car diagram to mark damage' })}
          </p>

          <div
            className="relative border border-border rounded-lg bg-white dark:bg-slate-900 select-none"
            style={{ paddingBottom: '60%' }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <CarTopViewSvg
                markers={inspectionMarkers}
                onAddMarker={(x, y) => {
                  setInspectionMarkers(prev => [...prev, { x, y, type: selectedMarkerType, note: '' }])
                }}
                onRemoveMarker={i => {
                  setInspectionMarkers(prev => prev.filter((_, idx) => idx !== i))
                }}
              />
            </div>
          </div>

          {inspectionMarkers.length > 0 && (
            <div className="space-y-1">
              {inspectionMarkers.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor:
                        m.type === 'scratch'
                          ? '#ef4444'
                          : m.type === 'dent'
                            ? '#f97316'
                            : m.type === 'broken'
                              ? '#1e293b'
                              : '#eab308',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="capitalize font-medium">{m.type}</span>
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={m.note}
                    onChange={e => {
                      const updated = [...inspectionMarkers]
                      updated[i] = { ...updated[i], note: e.target.value }
                      setInspectionMarkers(updated)
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 border border-input rounded px-2 py-1 bg-background text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setInspectionMarkers(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="General inspection notes..."
            value={inspectionNotes}
            onChange={e => setInspectionNotes(e.target.value)}
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
          />

          {inspectionMarkers.length > 0 && (
            <button
              type="button"
              onClick={() => setInspectionMarkers([])}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Clear all markers
            </button>
          )}
        </div>
      )}
    </div>
  )
}
