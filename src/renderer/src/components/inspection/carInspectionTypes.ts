export type InspectionMarkerType = 'scratch' | 'dent' | 'broken' | 'other'

/** x/y are 0–100, as fractions of the SVG viewBox (200×350) — matches custom receipt PDF. */
export interface InspectionMarker {
  x: number
  y: number
  type: InspectionMarkerType
  note: string
}

export type InspectionDataPayload = {
  markers: InspectionMarker[]
  notes: string
}
