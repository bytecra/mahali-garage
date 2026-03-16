/**
 * License manager — device-bound, time-limited license validation.
 * Reads/writes encrypted .license.dat in app userData directory.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDeviceId } from './device-fingerprint'
import { encrypt, decrypt } from './encryption'

function getHmacSecret(): string {
  const secret = process.env.LICENSE_HMAC_SECRET
  if (!secret) {
    throw new Error(
      'LICENSE_HMAC_SECRET environment variable is not set. ' +
        'Cannot verify license signatures without a valid signing secret.'
    )
  }
  return secret
}

export enum LicenseTier {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  TRIAL = 'TRIAL',
}

export type LicenseType =
  // BASIC tier
  | 'BASIC_LIFETIME'
  | 'BASIC_TRIAL_7'
  | 'BASIC_TRIAL_14'
  // STANDARD tier
  | 'STANDARD_LIFETIME'
  | 'STANDARD_TRIAL_14'
  | 'STANDARD_TRIAL_30'
  | 'STANDARD_YEARLY'
  // PREMIUM tier
  | 'PREMIUM_LIFETIME'
  | 'PREMIUM_TRIAL_30'
  | 'PREMIUM_YEARLY'

export interface LicenseData {
  deviceId: string
  type: LicenseType
  expiresAt: number
  activatedAt: number
}

export interface LicenseStatus {
  valid: boolean
  licensed: boolean
  reason?: string
  deviceId?: string
  type?: LicenseType
  expiresAt?: number | null   // milliseconds since epoch (null for lifetime)
  daysRemaining?: number | null
  activatedAt?: number
  hwMatch?: boolean
  gracePeriod?: boolean
  graceUntil?: string | null
}

export interface LicenseInfo {
  deviceId: string
  tier: LicenseTier
  duration: 'LIFETIME' | 'LIMITED'
  type: LicenseType
  expiresAt: number | null      // ms or null
  isActive: boolean
  daysRemaining: number | null
  maxUsers: number              // 1 / 5 / -1 (unlimited)
}

const LICENSE_FILENAME = '.license.dat'

function getLicensePath(): string {
  return path.join(app.getPath('userData'), LICENSE_FILENAME)
}

function signPayload(deviceId: string, type: string, expiresAt: number): string {
  const payload = `${deviceId}:${type}:${expiresAt}`
  return crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex').slice(0, 32)
}

/**
 * Parse and validate a license code. Returns license data if valid, null otherwise.
 * Format: DEVICEID-TYPE-EXPIRY-SIGNATURE
 */
function parseLicenseCode(code: string): LicenseData | null {
  const trimmed = code.replace(/\s/g, '')
  const parts = trimmed.split('-')
  if (parts.length < 4) return null
  const [deviceId, type, expiryStr, signature] = parts
  if (!deviceId || !type || !expiryStr || !signature) return null
  const expiresAt = parseInt(expiryStr, 10)
  if (isNaN(expiresAt)) return null
  const exp = expiresAt
  const expectedSig = signPayload(deviceId, type, exp)
  if (expectedSig !== signature) return null
  const validTypes: LicenseType[] = [
    'BASIC_LIFETIME',
    'BASIC_TRIAL_7',
    'BASIC_TRIAL_14',
    'STANDARD_LIFETIME',
    'STANDARD_TRIAL_14',
    'STANDARD_TRIAL_30',
    'STANDARD_YEARLY',
    'PREMIUM_LIFETIME',
    'PREMIUM_TRIAL_30',
    'PREMIUM_YEARLY',
  ]
  if (!validTypes.includes(type as LicenseType)) return null
  return {
    deviceId,
    type: type as LicenseType,
    expiresAt: exp,
    activatedAt: Date.now(),
  }
}

function serializeLicenseData(data: LicenseData): Buffer {
  const json = JSON.stringify(data)
  return Buffer.from(json, 'utf8')
}

function deserializeLicenseData(buf: Buffer): LicenseData | null {
  try {
    const json = buf.toString('utf8')
    const data = JSON.parse(json) as LicenseData
    if (!data.deviceId || !data.type || typeof data.expiresAt !== 'number' || typeof data.activatedAt !== 'number') return null
    return data
  } catch {
    return null
  }
}

/**
 * Check current license status. Reads .license.dat, validates device and expiry.
 */
export function checkLicense(): LicenseStatus {
  const currentDeviceId = getDeviceId()
  const filePath = getLicensePath()
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, licensed: false, reason: 'No license found. Please activate.' }
    }
    const raw = fs.readFileSync(filePath)
    const decrypted = decrypt(raw)
    if (!decrypted) {
      return { valid: false, licensed: false, reason: 'License file is corrupted or tampered.' }
    }
    const data = deserializeLicenseData(decrypted)
    if (!data) {
      return { valid: false, licensed: false, reason: 'Invalid license data.' }
    }
    if (data.deviceId !== currentDeviceId) {
      return { valid: false, licensed: false, reason: 'This license is bound to a different device.' }
    }
    const nowSec = Math.floor(Date.now() / 1000)
    if (data.expiresAt > 0 && nowSec > data.expiresAt) {
      return { valid: false, licensed: false, reason: 'License has expired.' }
    }
    const daysRemaining =
      data.expiresAt === 0
        ? null
        : Math.max(0, Math.ceil((data.expiresAt - nowSec) / (24 * 60 * 60)))
    return {
      valid: true,
      licensed: true,
      deviceId: currentDeviceId,
      type: data.type,
      expiresAt: data.expiresAt === 0 ? null : data.expiresAt * 1000,
      daysRemaining,
      activatedAt: data.activatedAt,
      hwMatch: true,
    }
  } catch (e) {
    return { valid: false, licensed: false, reason: 'Failed to read license.' }
  }
}

/**
 * Activate a license code on this device. Validates and saves encrypted license.
 */
export function activateLicense(code: string): { success: boolean; error?: string } {
  const currentDeviceId = getDeviceId()
  const data = parseLicenseCode(code)
  if (!data) return { success: false, error: 'Invalid license code format or signature.' }
  if (data.deviceId !== currentDeviceId) {
    return { success: false, error: 'This license code is for a different device. Use the device ID shown on this screen.' }
  }
  if (data.expiresAt > 0 && Date.now() > data.expiresAt) {
    return { success: false, error: 'This license has already expired.' }
  }
  try {
    const filePath = getLicensePath()
    const plain = serializeLicenseData(data)
    const encrypted = encrypt(plain)
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 })
    return { success: true }
  } catch (e) {
    return { success: false, error: 'Failed to save license.' }
  }
}

/**
 * Return current license info for display (device ID, type, expiry, days left).
 */
export function getLicenseInfo(): LicenseStatus {
  return checkLicense()
}

/**
 * Returns true if the current license is expired.
 */
export function isExpired(): boolean {
  const filePath = getLicensePath()
  try {
    if (!fs.existsSync(filePath)) return true
    const raw = fs.readFileSync(filePath)
    const decrypted = decrypt(raw)
    if (!decrypted) return true
    const data = deserializeLicenseData(decrypted)
    if (!data) return true
    if (data.expiresAt === 0) return false
    const nowSec = Math.floor(Date.now() / 1000)
    return nowSec > data.expiresAt
  } catch {
    return true
  }
}

/**
 * Days until expiration. null for LIFETIME, 0 if expired.
 */
export function getDaysRemaining(): number | null {
  const status = checkLicense()
  return status.daysRemaining ?? null
}

export function extractTierFromLicenseType(
  type: LicenseType
): 'BASIC' | 'STANDARD' | 'PREMIUM' | 'UNKNOWN' {
  if (type.startsWith('BASIC')) return 'BASIC'
  if (type.startsWith('STANDARD')) return 'STANDARD'
  if (type.startsWith('PREMIUM')) return 'PREMIUM'
  return 'UNKNOWN'
}

export function getUserLimitForTier(
  tier: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'UNKNOWN'
): number {
  switch (tier) {
    case 'BASIC':
      return 1
    case 'STANDARD':
      return 5
    case 'PREMIUM':
      return -1
    default:
      return 1
  }
}

function parseTierFromType(type: LicenseType): LicenseTier {
  if (type.startsWith('PREMIUM')) return LicenseTier.PREMIUM
  if (type.startsWith('STANDARD')) return LicenseTier.STANDARD
  if (type.startsWith('BASIC')) return LicenseTier.BASIC
  if (type.startsWith('TRIAL')) return LicenseTier.TRIAL
  return LicenseTier.BASIC
}

export function getTieredLicenseInfo(): LicenseInfo {
  const status = checkLicense()
  const type = (status.type as LicenseType | undefined) || 'BASIC_LIFETIME'
  const tier = parseTierFromType(type)
  const maxUsers = getUserLimitForTier(
    tier === LicenseTier.BASIC
      ? 'BASIC'
      : tier === LicenseTier.STANDARD
      ? 'STANDARD'
      : tier === LicenseTier.PREMIUM
      ? 'PREMIUM'
      : 'UNKNOWN'
  )
  const duration: 'LIFETIME' | 'LIMITED' =
    type.includes('LIFETIME') ? 'LIFETIME' : 'LIMITED'

  return {
    deviceId: getCurrentDeviceId(),
    tier,
    duration,
    type,
    expiresAt: status.expiresAt ?? null,
    isActive: status.valid && status.licensed && !isExpired(),
    daysRemaining: status.daysRemaining ?? null,
    maxUsers,
  }
}

export function hasFeature(feature: string): boolean {
  const info = getTieredLicenseInfo()
  if (!info.isActive) return false

  const tier = info.tier
  const stdOrPremium = tier === LicenseTier.STANDARD || tier === LicenseTier.PREMIUM
  const premiumOnly = tier === LicenseTier.PREMIUM

  const featureAccess: Record<string, boolean> = {
    // BASIC (all tiers)
    'dashboard.view': true,
    'quick_invoice': true,
    'pos': true,
    'parts.view': true,
    'parts.edit': true,
    'inventory.view': true,
    'inventory.edit': true,
    'owners.view': true,
    'owners.edit': true,
    'customers.view': true,
    'customers.edit': true,
    'settings.view': true,
    'settings.edit': true,

    // STANDARD+ (STANDARD and PREMIUM)
    'job_cards.view': stdOrPremium,
    'job_cards.edit': stdOrPremium,
    'vehicles.view': stdOrPremium,
    'vehicles.edit': stdOrPremium,
    'reports.view': stdOrPremium,
    'reports.export': stdOrPremium,
    'expenses.view': stdOrPremium,
    'expenses.add': stdOrPremium,
    'tasks.view': stdOrPremium,
    'tasks.add': stdOrPremium,
    'calendar.view': stdOrPremium,
    'invoices.view': stdOrPremium,
    'invoices.edit': stdOrPremium,
    'repairs.view': stdOrPremium,
    'repairs.edit': stdOrPremium,

    // PREMIUM only
    'services.view': premiumOnly,
    'services.edit': premiumOnly,
    'job_cards.advanced': premiumOnly,
    'users.advanced_permissions': premiumOnly,
    'activity_log.view': premiumOnly,
    'backup.manage': premiumOnly,
  }

  return !!featureAccess[feature]
}

/**
 * Get current device ID for display in activation UI.
 */
export function getCurrentDeviceId(): string {
  return getDeviceId()
}
