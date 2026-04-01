/**
 * One-time developer script: downloads car brand logos and generates
 * src/main/database/migrations/032_seed_car_brands.ts with embedded data URLs.
 *
 * Run from repo root: npm run generate-brands
 * Do not run in CI/CD.
 */
import { writeFileSync } from 'fs'
import { join } from 'path'

const LOGO_BASE =
  'https://raw.githubusercontent.com/filippofilip95/car-logos-dataset/master/logos/thumb/'

const BRANDS: Array<{ slug: string; name: string }> = [
  { slug: 'toyota', name: 'Toyota' },
  { slug: 'honda', name: 'Honda' },
  { slug: 'ford', name: 'Ford' },
  { slug: 'bmw', name: 'BMW' },
  { slug: 'mercedes-benz', name: 'Mercedes-Benz' },
  { slug: 'nissan', name: 'Nissan' },
  { slug: 'hyundai', name: 'Hyundai' },
  { slug: 'kia', name: 'Kia' },
  { slug: 'chevrolet', name: 'Chevrolet' },
  { slug: 'volkswagen', name: 'Volkswagen' },
  { slug: 'audi', name: 'Audi' },
  { slug: 'lexus', name: 'Lexus' },
  { slug: 'mitsubishi', name: 'Mitsubishi' },
  { slug: 'mazda', name: 'Mazda' },
  { slug: 'jeep', name: 'Jeep' },
  { slug: 'land-rover', name: 'Land Rover' },
  { slug: 'porsche', name: 'Porsche' },
  { slug: 'infiniti', name: 'Infiniti' },
  { slug: 'dodge', name: 'Dodge' },
  { slug: 'ram', name: 'RAM' },
  { slug: 'gmc', name: 'GMC' },
  { slug: 'cadillac', name: 'Cadillac' },
  { slug: 'jaguar', name: 'Jaguar' },
  { slug: 'volvo', name: 'Volvo' },
  { slug: 'subaru', name: 'Subaru' },
  { slug: 'suzuki', name: 'Suzuki' },
  { slug: 'renault', name: 'Renault' },
  { slug: 'peugeot', name: 'Peugeot' },
  { slug: 'fiat', name: 'Fiat' },
  { slug: 'alfa-romeo', name: 'Alfa Romeo' },
]

async function downloadLogo(slug: string): Promise<string | null> {
  const url = `${LOGO_BASE}${slug}.png`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[generate-brands] skip ${slug}: HTTP ${res.status}`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch (e) {
    console.warn(`[generate-brands] skip ${slug}:`, e)
    return null
  }
}

async function main(): Promise<void> {
  const brands: Array<{ name: string; logo: string | null }> = []

  for (const { slug, name } of BRANDS) {
    const logo = await downloadLogo(slug)
    if (logo != null) {
      brands.push({ name, logo })
    }
  }

  const brandLines = brands
    .map(b => `    { name: ${JSON.stringify(b.name)}, logo: ${JSON.stringify(b.logo)} },`)
    .join('\n')

  const fileContent = `import Database from 'better-sqlite3'

export function migration032(db: Database.Database): void {
  const brands: Array<{ name: string; logo: string | null }> = [
${brandLines}
  ]

  const insert = db.prepare(
    'INSERT OR IGNORE INTO car_brands (name, logo) VALUES (?, ?)'
  )

  const insertMany = db.transaction(() => {
    for (const brand of brands) {
      insert.run(brand.name, brand.logo)
    }
  })

  insertMany()
}
`

  const outPath = join(process.cwd(), 'src/main/database/migrations/032_seed_car_brands.ts')
  writeFileSync(outPath, fileContent, 'utf-8')

  console.log(`Wrote ${outPath}`)
  console.log(`Seeded brands (successful downloads): ${brands.length} / ${BRANDS.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
