import Database from 'better-sqlite3'

export function migration059(db: Database.Database): void {
  // Remove auto-repair job types and replace with gaming store job types
  db.exec(`DELETE FROM job_types;`)

  const insert = db.prepare(
    `INSERT OR IGNORE INTO job_types (name, description, sort_order) VALUES (?, ?, ?)`
  )

  const types: [string, string, number][] = [
    ['Build New PC',         'Full custom PC build from components',           1],
    ['PC Repair',            'Diagnose and repair desktop PC issues',          2],
    ['Laptop Repair',        'Diagnose and repair laptop issues',              3],
    ['Console Repair',       'Repair gaming consoles (PS, Xbox, Nintendo)',    4],
    ['PC Cleaning',          'Internal dust cleaning and thermal paste',       5],
    ['Console Cleaning',     'Internal cleaning of gaming consoles',           6],
    ['OS Installation',      'Windows / Linux installation and setup',         7],
    ['Software Setup',       'Driver, software, and game installation',        8],
    ['Upgrade',              'RAM, SSD, GPU or other hardware upgrade',        9],
    ['Data Recovery',        'Recover data from failed drives',               10],
    ['Network Setup',        'Home or office network and router setup',       11],
    ['Virus Removal',        'Malware and virus removal',                     12],
    ['Screen Replacement',   'Laptop or monitor screen replacement',          13],
    ['Controller Repair',    'Gamepad and controller repair',                 14],
    ['Other',                'Other services',                                15],
  ]

  for (const [name, description, sort_order] of types) {
    insert.run(name, description, sort_order)
  }
}
