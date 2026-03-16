/**
 * Device fingerprint module — generates a stable, device-bound ID.
 *
 * Strategy:
 * - Build a fingerprint from stable hardware/OS data (CPU, MACs, RAM, platform, hostname).
 * - Hash it to a 16-char uppercase hex string.
 * - Persist the first generated ID to a file in userData so it never changes
 *   even if minor hardware details change later.
 */

import { createHash } from 'crypto'
import {
  networkInterfaces,
  cpus,
  platform,
  arch,
  totalmem,
  hostname,
} from 'os'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const SALT = 'opskey-fp-v1'

function getDeviceIdFilePath(): string {
  return join(app.getPath('userData'), '.device-id')
}

/**
 * Collect stable hardware/OS identifiers and return a string to hash.
 */
function buildFingerprintComponents(): { components: string[]; fingerprint: string } {
  const components: string[] = []

  // CPU info: model + core count
  try {
    const info = cpus()
    if (info && info.length > 0) {
      components.push(`cpu:${(info[0].model || '').trim()}`)
      components.push(`cores:${info.length}`)
    }
  } catch {
    components.push('cpu:unknown')
  }

  // MAC addresses: non-internal, non-zero, sorted alphabetically
  try {
    const ifaces = networkInterfaces()
    const macs: string[] = []
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name]
      if (!list) continue
      for (const addr of list) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          macs.push(addr.mac)
        }
      }
    }
    macs.sort()
    if (macs.length > 0) {
      components.push(`mac:${macs.join(',')}`)
    } else {
      components.push('mac:none')
    }
  } catch {
    components.push('mac:error')
  }

  // OS platform / arch
  components.push(`platform:${platform()}`)
  components.push(`arch:${arch()}`)

  // Total RAM
  try {
    components.push(`ram:${totalmem()}`)
  } catch {
    components.push('ram:unknown')
  }

  // Hostname (first segment only, relatively stable)
  try {
    const host = hostname().split('.')[0]
    components.push(`host:${host}`)
  } catch {
    components.push('host:unknown')
  }

  const fingerprint = components.join('|')
  return { components, fingerprint }
}

/**
 * Generate a 16-character device fingerprint from hardware info (no persistence).
 */
export function getDeviceFingerprint(): string {
  const { fingerprint } = buildFingerprintComponents()
  const hash = createHash('sha256').update(SALT + fingerprint).digest('hex')
  return hash.substring(0, 16).toUpperCase()
}

/**
 * Debug helper: returns the raw components and the derived ID.
 */
export function getDeviceFingerprintDebug(): { deviceId: string; components: string } {
  const { fingerprint } = buildFingerprintComponents()
  const hash = createHash('sha256').update(SALT + fingerprint).digest('hex')
  const deviceId = hash.substring(0, 16).toUpperCase()
  return { deviceId, components: fingerprint }
}

/**
 * Returns a stable 16-character device ID.
 * - On first call: generates from hardware and persists to .device-id file.
 * - On subsequent calls: reads from the file to stay consistent across restarts.
 */
export function getDeviceId(): string {
  const filePath = getDeviceIdFilePath()

  if (existsSync(filePath)) {
    try {
      const saved = readFileSync(filePath, 'utf8').trim()
      if (saved && saved.length === 16) {
        return saved
      }
    } catch {
      // fall through to regenerate
    }
  }

  const generated = getDeviceFingerprint()

  try {
    writeFileSync(filePath, generated, 'utf8')
  } catch {
    // If we fail to write, still return generated ID so app can continue
  }

  return generated
}

