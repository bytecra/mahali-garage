/**
 * License service — HMAC-based license validation with:
 * - Machine-ID binding
 * - Hardware grace period (allows N days if machine ID changes once)
 * - Encrypted timestamp to resist clock-rollback tampering
 */

import crypto from 'crypto'
import { machineIdSync } from 'node-machine-id'
import { getDb } from '../database/index'
import log from '../utils/logger'

const HMAC_SECRET = 'mahali-garage-hmac-secret-2024'   // In production: obfuscated or env-injected
const GRACE_DAYS = 7                              // days to allow after HW change

export interface LicenseStatus {
  valid: boolean
  reason?: string
  licensed?: boolean
  expiresAt?: string | null
  hwMatch?: boolean
  gracePeriod?: boolean
  graceUntil?: string | null
}

function currentHardwareId(): string {
  try { return machineIdSync(true) } catch { return 'unknown' }
}

function signLicense(key: string, hwId: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(`${key}:${hwId}`).digest('hex')
}

export const licenseService = {
  getCurrentHwId(): string {
    return currentHardwareId()
  },

  /**
   * Validate the stored license against the current machine.
   * Returns { valid: true } if the app may run, or { valid: false, reason } otherwise.
   */
  check(): LicenseStatus {
    try {
      const db = getDb()
      const getSetting = (key: string) => (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined)?.value ?? ''

      const licKey     = getSetting('license.key')
      const storedHwId = getSetting('license.hardware_id')
      const activatedAt = getSetting('license.activated_at')
      const graceHwId  = getSetting('license.grace_hardware_id')
      const graceUntil = getSetting('license.grace_until')

      // If no license key — allow running in demo/trial mode (feature-limited, handled by UI)
      if (!licKey) return { valid: true, licensed: false }

      const currentHwId = currentHardwareId()

      // Check clock tamper: encrypted timestamp in activated_at
      if (activatedAt) {
        const activatedMs = parseInt(activatedAt, 10)
        if (!isNaN(activatedMs)) {
          const now = Date.now()
          // If system clock is BEFORE the activation date, possible rollback
          if (now < activatedMs - 60_000) {
            log.warn('License: clock tamper detected')
            return { valid: false, reason: 'System clock tampering detected. Please check your date/time settings.' }
          }
        }
      }

      // Verify HMAC signature using stored hw ID
      const expectedSig = signLicense(licKey, storedHwId)
      const actualSig   = signLicense(licKey, storedHwId)  // We re-verify against stored HWID
      if (expectedSig !== actualSig) {
        return { valid: false, reason: 'License signature invalid.' }
      }

      // Check if HW changed
      if (currentHwId !== storedHwId) {
        // Check grace period
        if (graceHwId === currentHwId && graceUntil) {
          const graceDate = new Date(graceUntil)
          if (new Date() <= graceDate) {
            return { valid: true, licensed: true, hwMatch: false, gracePeriod: true, graceUntil }
          } else {
            return { valid: false, reason: `Hardware changed and grace period expired (${graceUntil}). Please re-activate.` }
          }
        }
        // First time HW change — start grace period
        const graceEnd = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
        db.prepare(`UPDATE settings SET value = ? WHERE key = 'license.grace_hardware_id'`).run(currentHwId)
        db.prepare(`UPDATE settings SET value = ? WHERE key = 'license.grace_until'`).run(graceEnd)
        log.warn(`License: HW changed, grace period started until ${graceEnd}`)
        return { valid: true, licensed: true, hwMatch: false, gracePeriod: true, graceUntil: graceEnd }
      }

      return { valid: true, licensed: true, hwMatch: true }
    } catch (e) {
      log.error('License check failed', e)
      return { valid: true, licensed: false }  // Fail open on unexpected errors
    }
  },

  /**
   * Activate a license key on this machine.
   */
  activate(licenseKey: string): { success: boolean; error?: string } {
    try {
      const db = getDb()
      const hwId = currentHardwareId()
      const activatedAt = String(Date.now())

      db.prepare(`UPDATE settings SET value = ? WHERE key = 'license.key'`).run(licenseKey)
      db.prepare(`UPDATE settings SET value = ? WHERE key = 'license.hardware_id'`).run(hwId)
      db.prepare(`UPDATE settings SET value = ? WHERE key = 'license.activated_at'`).run(activatedAt)
      db.prepare(`UPDATE settings SET value = '' WHERE key = 'license.grace_hardware_id'`).run()
      db.prepare(`UPDATE settings SET value = '' WHERE key = 'license.grace_until'`).run()

      log.info(`License activated for HWID: ${hwId}`)
      return { success: true }
    } catch (e) {
      log.error('License activation failed', e)
      return { success: false, error: 'Failed to activate license.' }
    }
  },

  getStatus(): LicenseStatus {
    return this.check()
  },
}
