import Database from 'better-sqlite3'

export function migration030(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_is_paid
      ON expenses(is_paid);
    CREATE INDEX IF NOT EXISTS idx_expenses_due_date
      ON expenses(due_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_due
      ON expenses(is_paid, due_date);

    CREATE INDEX IF NOT EXISTS idx_custom_receipts_created_at
      ON custom_receipts(created_at);
    CREATE INDEX IF NOT EXISTS idx_custom_receipts_payment_method
      ON custom_receipts(payment_method);
    CREATE INDEX IF NOT EXISTS idx_custom_receipts_method_created
      ON custom_receipts(payment_method, created_at);

    CREATE INDEX IF NOT EXISTS idx_payments_method
      ON payments(method);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at
      ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_customer
      ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_method_created
      ON payments(method, created_at);
  `)
}
