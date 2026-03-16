import { getDb } from '../index'

export interface SupplierRow {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  product_count?: number
}

export interface SupplierFilters {
  search?: string
  page?: number
  pageSize?: number
}

export const supplierRepo = {
  list(filters: SupplierFilters = {}): { items: SupplierRow[]; total: number } {
    const { search = '', page = 1, pageSize = 25 } = filters
    const offset = (page - 1) * pageSize
    const like = `%${search}%`

    const where = search
      ? 'WHERE s.name LIKE ? OR s.phone LIKE ? OR s.contact_name LIKE ?'
      : ''
    const params = search ? [like, like, like] : []

    const total = (getDb().prepare(`
      SELECT COUNT(*) as cnt FROM suppliers s ${where}
    `).get(...params) as { cnt: number }).cnt

    const items = getDb().prepare(`
      SELECT s.*, COUNT(p.id) as product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id AND p.is_active = 1
      ${where}
      GROUP BY s.id
      ORDER BY s.name
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as SupplierRow[]

    return { items, total }
  },

  findById(id: number): SupplierRow | undefined {
    return getDb().prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as SupplierRow | undefined
  },

  listAll(): Pick<SupplierRow, 'id' | 'name'>[] {
    return getDb().prepare('SELECT id, name FROM suppliers ORDER BY name').all() as Pick<SupplierRow, 'id' | 'name'>[]
  },

  create(data: Omit<SupplierRow, 'id' | 'created_at' | 'updated_at' | 'product_count'>): number {
    const result = getDb().prepare(`
      INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.name, data.contact_name ?? null, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null)
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Omit<SupplierRow, 'id' | 'created_at' | 'updated_at' | 'product_count'>>): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`
      UPDATE suppliers SET ${fields}, updated_at = datetime('now') WHERE id = ?
    `).run(...Object.values(data), id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM suppliers WHERE id = ?').run(id)
  },
}
