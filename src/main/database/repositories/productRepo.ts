import { getDb } from '../index'

export interface ProductRow {
  id: number
  name: string
  sku: string | null
  barcode: string | null
  description: string | null
  category_id: number | null
  brand_id: number | null
  supplier_id: number | null
  cost_price: number
  sell_price: number
  stock_quantity: number
  low_stock_threshold: number
  unit: string
  is_active: number
  image_path: string | null
  created_at: string
  updated_at: string
  // Joined fields
  category_name?: string
  brand_name?: string
  supplier_name?: string
}

export interface StockAdjustmentRow {
  id: number
  product_id: number
  user_id: number | null
  type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number
  qty_before: number
  qty_after: number
  reason: string | null
  reference: string | null
  created_at: string
}

export interface ProductFilters {
  search?: string
  category_id?: number
  brand_id?: number
  supplier_id?: number
  low_stock_only?: boolean
  is_active?: boolean
  page?: number
  pageSize?: number
}

const PRODUCT_SELECT = `
  p.*,
  c.name as category_name,
  b.name as brand_name,
  s.name as supplier_name
`

const PRODUCT_JOINS = `
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
`

export const productRepo = {
  list(filters: ProductFilters = {}): { items: ProductRow[]; total: number } {
    const {
      search = '',
      category_id,
      brand_id,
      supplier_id,
      low_stock_only = false,
      is_active = true,
      page = 1,
      pageSize = 25,
    } = filters

    const conditions: string[] = [`p.is_active = ${is_active ? 1 : 0}`]
    const params: (string | number)[] = []

    if (search) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)')
      const like = `%${search}%`
      params.push(like, like, like)
    }
    if (category_id) { conditions.push('p.category_id = ?'); params.push(category_id) }
    if (brand_id)    { conditions.push('p.brand_id = ?');    params.push(brand_id) }
    if (supplier_id) { conditions.push('p.supplier_id = ?'); params.push(supplier_id) }
    if (low_stock_only) conditions.push('p.stock_quantity <= p.low_stock_threshold')

    const where = `WHERE ${conditions.join(' AND ')}`
    const offset = (page - 1) * pageSize

    const total = (getDb().prepare(`SELECT COUNT(*) as cnt ${PRODUCT_JOINS} ${where}`).get(...params) as { cnt: number }).cnt
    const items = getDb().prepare(`SELECT ${PRODUCT_SELECT} ${PRODUCT_JOINS} ${where} ORDER BY p.name LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as ProductRow[]

    return { items, total }
  },

  findById(id: number): ProductRow | undefined {
    return getDb().prepare(`SELECT ${PRODUCT_SELECT} ${PRODUCT_JOINS} WHERE p.id = ?`).get(id) as ProductRow | undefined
  },

  findByBarcode(barcode: string): ProductRow | undefined {
    return getDb().prepare(`SELECT ${PRODUCT_SELECT} ${PRODUCT_JOINS} WHERE p.barcode = ? AND p.is_active = 1`).get(barcode) as ProductRow | undefined
  },

  search(query: string): ProductRow[] {
    const like = `%${query}%`
    return getDb().prepare(`
      SELECT ${PRODUCT_SELECT} ${PRODUCT_JOINS}
      WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
      ORDER BY p.name LIMIT 20
    `).all(like, like, like) as ProductRow[]
  },

  getLowStock(): ProductRow[] {
    return getDb().prepare(`
      SELECT ${PRODUCT_SELECT} ${PRODUCT_JOINS}
      WHERE p.stock_quantity <= p.low_stock_threshold AND p.is_active = 1
      ORDER BY (p.stock_quantity - p.low_stock_threshold) ASC
    `).all() as ProductRow[]
  },

  create(data: Omit<ProductRow, 'id' | 'created_at' | 'updated_at' | 'category_name' | 'brand_name' | 'supplier_name'>): number {
    const result = getDb().prepare(`
      INSERT INTO products (name, sku, barcode, description, category_id, brand_id, supplier_id,
        cost_price, sell_price, stock_quantity, low_stock_threshold, unit, is_active, image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.sku ?? null, data.barcode ?? null, data.description ?? null,
      data.category_id ?? null, data.brand_id ?? null, data.supplier_id ?? null,
      data.cost_price, data.sell_price, data.stock_quantity,
      data.low_stock_threshold, data.unit, data.is_active, data.image_path ?? null
    )
    return result.lastInsertRowid as number
  },

  update(id: number, data: Partial<Omit<ProductRow, 'id' | 'created_at' | 'category_name' | 'brand_name' | 'supplier_name'>>): void {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    getDb().prepare(`
      UPDATE products SET ${fields}, updated_at = datetime('now') WHERE id = ?
    `).run(...Object.values(data), id)
  },

  delete(id: number): void {
    // Soft delete
    getDb().prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id)
  },

  adjustStock(productId: number, userId: number | null, adjustment: {
    type: StockAdjustmentRow['type']
    quantity: number
    reason?: string
    reference?: string
  }): void {
    const db = getDb()
    const run = db.transaction(() => {
      const product = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as { stock_quantity: number } | undefined
      if (!product) throw new Error('Product not found')

      const qtyBefore = product.stock_quantity
      let qtyAfter: number

      if (adjustment.type === 'correction') {
        qtyAfter = adjustment.quantity // correction sets absolute value
      } else if (adjustment.type === 'in' || adjustment.type === 'return') {
        qtyAfter = qtyBefore + adjustment.quantity
      } else {
        // out, damage
        qtyAfter = qtyBefore - adjustment.quantity
        if (qtyAfter < 0) qtyAfter = 0
      }

      db.prepare(`UPDATE products SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(qtyAfter, productId)
      db.prepare(`
        INSERT INTO stock_adjustments (product_id, user_id, type, quantity, qty_before, qty_after, reason, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(productId, userId, adjustment.type, adjustment.quantity, qtyBefore, qtyAfter, adjustment.reason ?? null, adjustment.reference ?? null)
    })
    run()
  },

  getStockHistory(productId: number): StockAdjustmentRow[] {
    return getDb().prepare(`
      SELECT sa.*, u.full_name as user_name
      FROM stock_adjustments sa
      LEFT JOIN users u ON u.id = sa.user_id
      WHERE sa.product_id = ?
      ORDER BY sa.created_at DESC
      LIMIT 50
    `).all(productId) as StockAdjustmentRow[]
  },
}
