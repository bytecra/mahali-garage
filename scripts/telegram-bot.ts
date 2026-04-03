#!/usr/bin/env node
/**
 * Standalone Telegram admin bot — run locally:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_OWNER_ID=... LICENSE_HMAC_SECRET=... npm run bot
 *
 * Requires: node-telegram-bot-api (see package.json devDependencies)
 */

import crypto from 'crypto'
import TelegramBot from 'node-telegram-bot-api'
import { encrypt } from '../src/main/licensing/encryption'

// ── Env validation ───────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const OWNER_RAW = process.env.TELEGRAM_OWNER_ID
const HMAC_SECRET = process.env.LICENSE_HMAC_SECRET

function printEnvHelpAndExit(): never {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  Mahali Garage — Telegram Admin Bot                             ║
╚══════════════════════════════════════════════════════════════════╝

Set these environment variables before running:

  TELEGRAM_BOT_TOKEN   — from @BotFather
  TELEGRAM_OWNER_ID    — your numeric Telegram user ID (only this user may use the bot)
  LICENSE_HMAC_SECRET  — same HMAC secret as the Mahali Garage app / license generator

Example (PowerShell):

  $env:TELEGRAM_BOT_TOKEN="123456:ABC..."
  $env:TELEGRAM_OWNER_ID="123456789"
  $env:LICENSE_HMAC_SECRET="your-secret"
  npm run bot

Example (bash):

  TELEGRAM_BOT_TOKEN=... TELEGRAM_OWNER_ID=... LICENSE_HMAC_SECRET=... npm run bot
`)
  process.exit(1)
}

if (!TOKEN?.trim()) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is missing.\n')
  printEnvHelpAndExit()
}
if (!OWNER_RAW?.trim()) {
  console.error('ERROR: TELEGRAM_OWNER_ID is missing.\n')
  printEnvHelpAndExit()
}
if (!HMAC_SECRET?.trim()) {
  console.error('ERROR: LICENSE_HMAC_SECRET is missing.\n')
  printEnvHelpAndExit()
}

const TELEGRAM_OWNER_ID = Number(OWNER_RAW.trim())
if (!Number.isFinite(TELEGRAM_OWNER_ID)) {
  console.error('ERROR: TELEGRAM_OWNER_ID must be a numeric user ID.\n')
  printEnvHelpAndExit()
}

// Same algorithm as scripts/license-generator.ts + LICENSE_HMAC_SECRET from env
const HMAC: string = HMAC_SECRET

type BotLicenseType =
  | 'BASIC_LIFETIME'
  | 'STANDARD_LIFETIME'
  | 'PREMIUM_LIFETIME'
  | 'BASIC_TRIAL_7'
  | 'BASIC_TRIAL_14'
  | 'STANDARD_YEARLY'
  | 'PREMIUM_YEARLY'

const TYPE_DAYS: Record<BotLicenseType, number | null> = {
  BASIC_LIFETIME: null,
  BASIC_TRIAL_7: 7,
  BASIC_TRIAL_14: 14,
  STANDARD_LIFETIME: null,
  STANDARD_YEARLY: 365,
  PREMIUM_LIFETIME: null,
  PREMIUM_YEARLY: 365,
}

const VALID_TYPES: BotLicenseType[] = [
  'BASIC_LIFETIME',
  'STANDARD_LIFETIME',
  'PREMIUM_LIFETIME',
  'BASIC_TRIAL_7',
  'BASIC_TRIAL_14',
  'STANDARD_YEARLY',
  'PREMIUM_YEARLY',
]

function signPayload(deviceId: string, type: string, expiresAt: number): string {
  const payload = `${deviceId}:${type}:${expiresAt}`
  return crypto.createHmac('sha256', HMAC).update(payload).digest('hex').slice(0, 32)
}

function generateLicenseCode(deviceId: string, type: BotLicenseType): string {
  const days = TYPE_DAYS[type]
  const expiresAt = days === null ? 0 : Math.floor(Date.now() / 1000) + days * 24 * 60 * 60
  const signature = signPayload(deviceId, type, expiresAt)
  return `${deviceId}-${type}-${expiresAt}-${signature}`
}

interface LicenseData {
  deviceId: string
  type: BotLicenseType
  expiresAt: number
  activatedAt: number
}

function buildEncryptedLicenseFile(deviceId: string, type: BotLicenseType): Buffer {
  const days = TYPE_DAYS[type]
  const expiresAt = days === null ? 0 : Math.floor(Date.now() / 1000) + days * 24 * 60 * 60
  const data: LicenseData = {
    deviceId,
    type,
    expiresAt,
    activatedAt: Date.now(),
  }
  const plain = Buffer.from(JSON.stringify(data), 'utf8')
  return encrypt(plain)
}

function generateResetCode(deviceId: string, username: string): string {
  const hourTimestamp = Math.floor(Date.now() / (1000 * 60 * 60))
  const payload = `${deviceId}:${username}:${hourTimestamp}`
  const hash = crypto
    .createHmac('sha256', HMAC)
    .update(payload)
    .digest('hex')
    .toUpperCase()
    .slice(0, 12)
  return `MH-${hash.slice(0, 6)}-${hash.slice(6, 12)}`
}

function isOwner(msg: TelegramBot.Message): boolean {
  return msg.from?.id === TELEGRAM_OWNER_ID
}

async function sendUnauthorized(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, '⛔ Unauthorized')
  } catch {
    /* ignore */
  }
}

const HELP_TEXT = `Mahali Garage Admin Bot 🔧
Commands:
/license DEVICE_ID LICENSE_TYPE
/reset DEVICE_ID USERNAME
/help`

const bot = new TelegramBot(TOKEN, { polling: true })

bot.on('polling_error', (err) => {
  console.error('[telegram-bot] polling_error:', err?.message ?? err)
})

bot.onText(/\/start(?:\s|$)/i, async (msg) => {
  try {
    if (!isOwner(msg)) {
      await sendUnauthorized(bot, msg.chat.id)
      return
    }
    await bot.sendMessage(msg.chat.id, HELP_TEXT)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    try {
      await bot.sendMessage(msg.chat.id, `Error: ${err}`)
    } catch {
      /* ignore */
    }
  }
})

bot.onText(/\/help(?:\s|$)/i, async (msg) => {
  try {
    if (!isOwner(msg)) {
      await sendUnauthorized(bot, msg.chat.id)
      return
    }
    await bot.sendMessage(msg.chat.id, HELP_TEXT)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    try {
      await bot.sendMessage(msg.chat.id, `Error: ${err}`)
    } catch {
      /* ignore */
    }
  }
})

bot.onText(/^\/license(?:\s+|$)/i, async (msg) => {
  try {
    if (!isOwner(msg)) {
      await sendUnauthorized(bot, msg.chat.id)
      return
    }
    const chatId = msg.chat.id
    const parts = (msg.text ?? '').trim().split(/\s+/).filter(Boolean)
    if (parts.length < 3) {
      await bot.sendMessage(
        chatId,
        'Usage: /license DEVICE_ID LICENSE_TYPE\n\nTypes:\n' + VALID_TYPES.join(', ')
      )
      return
    }
    const deviceId = parts[1]
    const licenseType = parts[2].toUpperCase() as BotLicenseType

    if (!deviceId || deviceId.length < 8) {
      await bot.sendMessage(chatId, 'DEVICE_ID must be at least 8 characters.')
      return
    }
    if (!VALID_TYPES.includes(licenseType)) {
      await bot.sendMessage(
        chatId,
        `Invalid LICENSE_TYPE. Use one of:\n${VALID_TYPES.join(', ')}`
      )
      return
    }

    const code = generateLicenseCode(deviceId, licenseType)
    const fileBuf = buildEncryptedLicenseFile(deviceId, licenseType)
    const caption =
      `✅ License for ${deviceId}\n` +
      `Type: ${licenseType}\n\n` +
      `Code (for manual entry):\n${code}`
    await bot.sendDocument(
      chatId,
      fileBuf,
      { caption },
      { filename: 'license.dat', contentType: 'application/octet-stream' }
    )
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    try {
      await bot.sendMessage(msg.chat.id, `Error: ${err}`)
    } catch {
      /* ignore */
    }
  }
})

bot.onText(/^\/reset(?:\s+|$)/i, async (msg) => {
  try {
    if (!isOwner(msg)) {
      await sendUnauthorized(bot, msg.chat.id)
      return
    }
    const chatId = msg.chat.id
    const parts = (msg.text ?? '').trim().split(/\s+/).filter(Boolean)
    if (parts.length < 3) {
      await bot.sendMessage(chatId, 'Usage: /reset DEVICE_ID USERNAME')
      return
    }
    const deviceId = parts[1]
    const username = parts.slice(2).join(' ')
    if (!deviceId.trim() || !username.trim()) {
      await bot.sendMessage(chatId, 'DEVICE_ID and USERNAME are required.')
      return
    }

    const code = generateResetCode(deviceId.trim(), username.trim())
    const text =
      `🔑 Reset Code for ${username.trim()} on ${deviceId.trim()}\n\n` +
      `Code: ${code}\n\n` +
      `⏰ Valid for 1 hour only\n` +
      `📱 Send this code to the store owner\n` +
      `🔒 Works ONLY on device: ${deviceId.trim()}`
    await bot.sendMessage(chatId, text)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    try {
      await bot.sendMessage(msg.chat.id, `Error: ${err}`)
    } catch {
      /* ignore */
    }
  }
})

// Catch stray messages (optional reply)
bot.on('message', async (msg) => {
  try {
    if (!msg.text?.startsWith('/')) return
    if (/\/(start|help|license|reset)/i.test(msg.text.split(/\s+/)[0] ?? '')) return
    if (!isOwner(msg)) {
      await sendUnauthorized(bot, msg.chat.id)
      return
    }
    await bot.sendMessage(msg.chat.id, 'Unknown command. Try /help')
  } catch {
    /* ignore */
  }
})

process.on('unhandledRejection', (reason) => {
  console.error('[telegram-bot] unhandledRejection:', reason)
})

console.log('Mahali Garage Telegram bot is running (polling). Press Ctrl+C to stop.')
