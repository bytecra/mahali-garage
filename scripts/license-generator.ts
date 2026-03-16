#!/usr/bin/env node
/**
 * CLI tool to generate device-bound license codes for Mahali POS.
 * Use the same LICENSE_HMAC_SECRET as the app (or set via env).
 *
 * Usage:
 *   npx tsx scripts/license-generator.ts --device <DEVICE_ID> --type <TYPE>
 *
 * Examples:
 *   npx tsx scripts/license-generator.ts --device ABC123 --type BASIC_LIFETIME
 *   npx tsx scripts/license-generator.ts --device ABC123 --type STANDARD_LIFETIME
 *   npx tsx scripts/license-generator.ts --device ABC123 --type PREMIUM_LIFETIME
 *   npx tsx scripts/license-generator.ts --device ABC123 --type STANDARD_TRIAL_30
 *
 * Tiers:
 *   BASIC ($99):     POS, Inventory, Customers, 1 user
 *   STANDARD ($249): + Reports, Tasks, Expenses, Calendar, up to 5 users
 *   PREMIUM ($499):  + Repairs, unlimited users
 */

import crypto from 'crypto'

const rawSecret = process.env.LICENSE_HMAC_SECRET

if (!rawSecret) {
  console.error('ERROR: LICENSE_HMAC_SECRET environment variable must be set.')
  console.error(
    'Usage: LICENSE_HMAC_SECRET=your-secret-here npx tsx scripts/license-generator.ts --device <DEVICE_ID> --type <TYPE>'
  )
  process.exit(1)
}

const HMAC_SECRET: string = rawSecret

type LicenseType = 
  // BASIC
  | 'BASIC_LIFETIME'
  | 'BASIC_TRIAL_7'
  | 'BASIC_TRIAL_14'
  // STANDARD
  | 'STANDARD_LIFETIME'
  | 'STANDARD_TRIAL_14'
  | 'STANDARD_TRIAL_30'
  | 'STANDARD_YEARLY'
  // PREMIUM
  | 'PREMIUM_LIFETIME'
  | 'PREMIUM_TRIAL_30'
  | 'PREMIUM_YEARLY'

const TYPE_DAYS: Record<LicenseType, number | null> = {
  // BASIC
  BASIC_LIFETIME: null,
  BASIC_TRIAL_7: 7,
  BASIC_TRIAL_14: 14,
  // STANDARD
  STANDARD_LIFETIME: null,
  STANDARD_TRIAL_14: 14,
  STANDARD_TRIAL_30: 30,
  STANDARD_YEARLY: 365,
  // PREMIUM
  PREMIUM_LIFETIME: null,
  PREMIUM_TRIAL_30: 30,
  PREMIUM_YEARLY: 365,
}

function signPayload(deviceId: string, type: string, expiresAt: number): string {
  const payload = `${deviceId}:${type}:${expiresAt}`
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex').slice(0, 32)
}

function generateLicenseCode(deviceId: string, type: LicenseType): string {
  const days = TYPE_DAYS[type]
  const expiresAt = days === null ? 0 : Math.floor(Date.now() / 1000) + days * 24 * 60 * 60
  const signature = signPayload(deviceId, type, expiresAt)
  return `${deviceId}-${type}-${expiresAt}-${signature}`
}

function showUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Mahali POS - License Generator                     ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  npx tsx scripts/license-generator.ts --device <DEVICE_ID> --type <TYPE>

License Types:

BASIC TIER ($99):
  BASIC_LIFETIME       Lifetime Basic license
  BASIC_TRIAL_7        7-day Basic trial
  BASIC_TRIAL_14       14-day Basic trial

STANDARD TIER ($249):
  STANDARD_LIFETIME    Lifetime Standard license
  STANDARD_TRIAL_14    14-day Standard trial
  STANDARD_TRIAL_30    30-day Standard trial
  STANDARD_YEARLY      1-year Standard license

PREMIUM TIER ($499):
  PREMIUM_LIFETIME     Lifetime Premium license
  PREMIUM_TRIAL_30     30-day Premium trial
  PREMIUM_YEARLY       1-year Premium license

Examples:
  npx tsx scripts/license-generator.ts --device ABC123XYZ --type BASIC_LIFETIME
  npx tsx scripts/license-generator.ts --device ABC123XYZ --type STANDARD_LIFETIME
  npx tsx scripts/license-generator.ts --device ABC123XYZ --type PREMIUM_LIFETIME
  npx tsx scripts/license-generator.ts --device ABC123XYZ --type STANDARD_TRIAL_30

Tier Features:
  BASIC:    POS, Inventory, Customers, Settings (1 user)
  STANDARD: + Reports, Tasks, Expenses, Calendar (5 users)
  PREMIUM:  + Repairs, Advanced Permissions (unlimited users)
`)
  process.exit(1)
}

function parseArgs(): { deviceId: string; type: LicenseType } {
  const args = process.argv.slice(2)
  let deviceId = ''
  let type: LicenseType | string = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--device' && args[i + 1]) {
      deviceId = args[++i]
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[++i]
    } else if (args[i] === '--help' || args[i] === '-h') {
      showUsage()
    }
  }

  const validTypes: LicenseType[] = [
    'BASIC_LIFETIME', 'BASIC_TRIAL_7', 'BASIC_TRIAL_14',
    'STANDARD_LIFETIME', 'STANDARD_TRIAL_14', 'STANDARD_TRIAL_30', 'STANDARD_YEARLY',
    'PREMIUM_LIFETIME', 'PREMIUM_TRIAL_30', 'PREMIUM_YEARLY',
  ]

  if (!validTypes.includes(type as LicenseType)) {
    console.error(`\n❌ Invalid --type: "${type}"\n`)
    showUsage()
  }

  if (!deviceId || deviceId.length < 8) {
    console.error('\n❌ --device <DEVICE_ID> is required (min 8 characters)\n')
    showUsage()
  }

  return { deviceId, type: type as LicenseType }
}

// Main execution
const { deviceId, type } = parseArgs()
const code = generateLicenseCode(deviceId, type)

// Extract tier and duration info
const tier = type.split('_')[0] // BASIC, STANDARD, or PREMIUM
const duration = type.includes('LIFETIME') 
  ? 'Lifetime' 
  : type.includes('YEARLY') 
  ? '1 year' 
  : `${TYPE_DAYS[type]} days`

console.log('\n✅ License Generated Successfully!\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`Device ID:    ${deviceId}`)
console.log(`Tier:         ${tier}`)
console.log(`Duration:     ${duration}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('\nLicense Code:\n')
console.log(`  ${code}`)
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
console.log('📋 Copy this code and send it to the customer.')
console.log('⚠️  This code only works on the device with the matching Device ID.\n')