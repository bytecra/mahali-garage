import Database from 'better-sqlite3'

export function migration052(db: Database.Database): void {
  db.exec(`
    ALTER TABLE job_cards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.number.mode', 'standard');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.number.prefix', 'JOB');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.number.include_year', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.number.padding', '4');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.number.yearly_reset', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('job_card.next_number_year', '');
  `)
}
