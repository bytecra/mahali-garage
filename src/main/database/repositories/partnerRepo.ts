import { getDb } from '../index'

export interface PartnerRow {
  id:           number
  name:         string
  type:         'distributor' | 'reseller' | 'manufacturer' | 'consultant' | 'other'
  contact_name: string | null
  phone:        string | null
  email:        string | null
  address:      string | null
  website:      string | null
  notes:        string | null
  created_at:   string
  updated_at:   string
}

export const partnerRepo = {
  list(filters: { search?: string; type?: string } = {}): PartnerRow[] {
    const { search = '', type = '' } = filters
    const conditions: string[] = []
    const params: unknown[] = []

    if (search) {
      conditions.push('(name LIKE ? OR contact_name LIKE ? OR phone LIKE ? OR email LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like, like)
    }
    if (type) {
      conditions.push('type = ?')
      params.push(type)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return getDb().prepare(`
      SELECT * FROM partners ${where} ORDER BY name
    `).all(...params) as PartnerRow[]
  },

  findById(id: number): PartnerRow | undefined {
    return getDb().prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow | undefined
  },

  create(data: Omit<PartnerRow, 'id' | 'created_at' | 'updated_at'>): number {
    const result = getDb().prepare(`
      INSERT INTO partners (name, type, contact_name, phone, email, address, website, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.type,
      data.contact_name ?? null, data.phone ?? null,
      data.email ?? null, data.address ?? null,
      data.website ?? null, data.notes ?? null
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Omit<PartnerRow, 'id' | 'created_at' | 'updated_at'>>): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`
      UPDATE partners SET ${fields}, updated_at = datetime('now') WHERE id = ?
    `).run(...Object.values(data), id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM partners WHERE id = ?').run(id)
  },
}
