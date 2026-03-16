import Database from 'better-sqlite3'

export function migration001(db: Database.Database): void {
  db.exec(`
    -- ── Auth ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      full_name     TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK(role IN ('owner','cashier','technician','accountant')),
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      granted       INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT NOT NULL,
      entity      TEXT,
      entity_id   INTEGER,
      details     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_user    ON activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);

    -- ── Inventory ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      contact_name  TEXT,
      phone         TEXT,
      email         TEXT,
      address       TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT    NOT NULL,
      sku                 TEXT    UNIQUE,
      barcode             TEXT    UNIQUE,
      description         TEXT,
      category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      brand_id            INTEGER REFERENCES brands(id)    ON DELETE SET NULL,
      supplier_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      cost_price          REAL    NOT NULL DEFAULT 0,
      sell_price          REAL    NOT NULL DEFAULT 0,
      stock_quantity      INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      unit                TEXT    NOT NULL DEFAULT 'pcs',
      is_active           INTEGER NOT NULL DEFAULT 1,
      image_path          TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_sku      ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL REFERENCES products(id),
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type        TEXT    NOT NULL CHECK(type IN ('in','out','correction','damage','return')),
      quantity    INTEGER NOT NULL,
      qty_before  INTEGER NOT NULL,
      qty_after   INTEGER NOT NULL,
      reason      TEXT,
      reference   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Customers ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      address     TEXT,
      notes       TEXT,
      balance     REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);

    -- ── Sales ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sales (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_number     TEXT NOT NULL UNIQUE,
      customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      user_id         INTEGER REFERENCES users(id)    ON DELETE SET NULL,
      subtotal        REAL NOT NULL DEFAULT 0,
      discount_type   TEXT CHECK(discount_type IN ('percent','fixed')),
      discount_value  REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_enabled     INTEGER NOT NULL DEFAULT 1,
      tax_rate        REAL NOT NULL DEFAULT 0,
      tax_amount      REAL NOT NULL DEFAULT 0,
      total_amount    REAL NOT NULL DEFAULT 0,
      amount_paid     REAL NOT NULL DEFAULT 0,
      balance_due     REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'draft'
                          CHECK(status IN ('draft','completed','voided','partial')),
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sales_sale_number ON sales(sale_number);
    CREATE INDEX IF NOT EXISTS idx_sales_customer    ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_status      ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_created     ON sales(created_at);

    CREATE TABLE IF NOT EXISTS sale_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name  TEXT NOT NULL,
      product_sku   TEXT,
      unit_price    REAL NOT NULL,
      cost_price    REAL NOT NULL DEFAULT 0,
      quantity      INTEGER NOT NULL DEFAULT 1,
      discount      REAL NOT NULL DEFAULT 0,
      line_total    REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

    CREATE TABLE IF NOT EXISTS payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      amount      REAL NOT NULL,
      method      TEXT NOT NULL CHECK(method IN ('cash','card','transfer','mobile','other')),
      reference   TEXT,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

    CREATE TABLE IF NOT EXISTS invoices (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      pdf_path       TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_sale   ON invoices(sale_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

    -- ── Repairs ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS repairs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number     TEXT NOT NULL UNIQUE,
      type           TEXT NOT NULL CHECK(type IN ('repair','pc_build','installation','other')),
      status         TEXT NOT NULL DEFAULT 'received'
                         CHECK(status IN ('received','diagnosed','waiting_parts',
                                          'in_progress','completed','delivered','cancelled')),
      priority       TEXT NOT NULL DEFAULT 'normal'
                         CHECK(priority IN ('low','normal','high','urgent')),
      customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      technician_id  INTEGER REFERENCES users(id)    ON DELETE SET NULL,
      created_by     INTEGER REFERENCES users(id)    ON DELETE SET NULL,
      device_type    TEXT,
      device_brand   TEXT,
      device_model   TEXT,
      serial_number  TEXT,
      reported_issue TEXT NOT NULL,
      diagnosis      TEXT,
      work_done      TEXT,
      parts_used     TEXT,
      estimated_cost REAL DEFAULT 0,
      final_cost     REAL DEFAULT 0,
      deposit_paid   REAL DEFAULT 0,
      estimated_date TEXT,
      completed_at   TEXT,
      delivered_at   TEXT,
      notes          TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_repairs_job_number ON repairs(job_number);
    CREATE INDEX IF NOT EXISTS idx_repairs_status     ON repairs(status);
    CREATE INDEX IF NOT EXISTS idx_repairs_technician ON repairs(technician_id);
    CREATE INDEX IF NOT EXISTS idx_repairs_customer   ON repairs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_repairs_priority   ON repairs(priority);

    CREATE TABLE IF NOT EXISTS repair_status_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_id   INTEGER NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status   TEXT NOT NULL,
      changed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Settings ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}
