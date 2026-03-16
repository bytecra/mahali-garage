import { getDb } from '../index'

export interface CategoryRow {
  id: number
  name: string
  description: string | null
  created_at: string
  product_count?: number
}

export const categoryRepo = {
  list(): CategoryRow[] {
    return getDb().prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      GROUP BY c.id
      ORDER BY c.name
    `).all() as CategoryRow[]
  },

  findById(id: number): CategoryRow | undefined {
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined
  },

  create(data: { name: string; description?: string }): number {
    const result = getDb().prepare(
      'INSERT INTO categories (name, description) VALUES (?, ?)'
    ).run(data.name, data.description ?? null)
    return result.lastInsertRowid as number
  },

  update(id: number, data: { name?: string; description?: string }): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`UPDATE categories SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
  },

  hasProducts(id: number): boolean {
    const row = getDb().prepare(
      'SELECT COUNT(*) as cnt FROM products WHERE category_id = ? AND is_active = 1'
    ).get(id) as { cnt: number }
    return row.cnt > 0
  },
}
