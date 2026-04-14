/** Vehicle row shape used when picking a car on a job card. */
export interface VehicleOption {
  id: number
  make: string
  model: string
  year: number | null
  license_plate: string | null
  vin: string | null
  color: string | null
  mileage: number
  owner_id: number | null
  owner_name?: string | null
}
