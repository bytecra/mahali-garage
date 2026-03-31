import Database from 'better-sqlite3'

export function migration023(db: Database.Database): void {
  db.exec(`
    ALTER TABLE custom_receipts ADD COLUMN department TEXT NOT NULL DEFAULT 'both';
    ALTER TABLE custom_receipts ADD COLUMN customer_phone TEXT;
    ALTER TABLE custom_receipts ADD COLUMN customer_email TEXT;
    ALTER TABLE custom_receipts ADD COLUMN customer_address TEXT;
    ALTER TABLE custom_receipts ADD COLUMN car_company TEXT;
    ALTER TABLE custom_receipts ADD COLUMN car_model TEXT;
    ALTER TABLE custom_receipts ADD COLUMN car_year TEXT;
    ALTER TABLE custom_receipts ADD COLUMN mechanical_services_json TEXT;
    ALTER TABLE custom_receipts ADD COLUMN programming_services_json TEXT;
  `)
}
