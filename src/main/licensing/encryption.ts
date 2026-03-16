/**
 * Encryption utilities for license file (.license.dat).
 * Uses AES-256-GCM for confidentiality and integrity.
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const SALT = 'opskey-lic-enc-v1'

function getEncryptionKey(): Buffer {
  const secret = process.env.LICENSE_ENCRYPTION_SECRET || 'opskey-default-encryption-key-32bytes!!'
  return crypto.createHash('sha256').update(SALT + secret, 'utf8').digest()
}

/**
 * Encrypt data and return a Buffer: iv (16) + authTag (16) + ciphertext.
 */
export function encrypt(plaintext: Buffer): Buffer {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted])
}

/**
 * Decrypt data produced by encrypt(). Returns null if decryption fails (tampered/corrupt).
 */
export function decrypt(ciphertext: Buffer): Buffer | null {
  try {
    if (ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH) return null
    const key = getEncryptionKey()
    const iv = ciphertext.subarray(0, IV_LENGTH)
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  } catch {
    return null
  }
}
