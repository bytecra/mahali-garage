import { getDb } from '../index'

export interface BrandRow {
  id: number
  name: string
  description: string | null
  created_at: string
  product_count?: number
}

export const brandRepo = {
  list(): BrandRow[] {
    return getDb().prepare(`
      SELECT b.*, COUNT(p.id) as product_count
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
      GROUP BY b.id
      ORDER BY b.name
    `).all() as BrandRow[]
  },

  findById(id: number): BrandRow | undefined {
    return getDb().prepare('SELECT * FROM brands WHERE id = ?').get(id) as BrandRow | undefined
  },

  create(data: { name: string; description?: string }): number {
    const result = getDb().prepare(
      'INSERT INTO brands (name, description) VALUES (?, ?)'
    ).run(data.name, data.description ?? null)
    return result.lastInsertRowid as number
  },

  update(id: number, data: { name?: string; description?: string }): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`UPDATE brands SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM brands WHERE id = ?').run(id)
  },

  hasProducts(id: number): boolean {
    const row = getDb().prepare(
      'SELECT COUNT(*) as cnt FROM products WHERE brand_id = ? AND is_active = 1'
    ).get(id) as { cnt: number }
    return row.cnt > 0
  },
}
