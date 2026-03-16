# Mahali POS — Device-Based Licensing

This document describes how to generate, distribute, and test license codes for the Mahali POS application.

## Overview

- **Device binding**: Each license code is bound to a specific device via a hardware fingerprint (Device ID).
- **Offline validation**: License is validated locally; no internet is required after activation.
- **Time-limited or lifetime**: Supports trial (7/30 days), 1-year, and lifetime licenses.
- **Storage**: Activated license is stored encrypted in the app's user data directory (`.license.dat`).

## License Code Format

```
DEVICEID-TYPE-EXPIRY-SIGNATURE
```

Example: `A1B2C3D4E5F6G7H8-STANDARD_365-1735689600-9A8B7C6D5E4F3A2B1C0D1E2F3A4B5`

- **DEVICEID**: 16-character alphanumeric device fingerprint (shown in the activation window).
- **TYPE**: `TRIAL_7`, `TRIAL_30`, `STANDARD_365`, or `LIFETIME`.
- **EXPIRY**: Unix timestamp (seconds). Use `0` for LIFETIME.
- **SIGNATURE**: HMAC-SHA256 (first 32 hex chars) to prevent forgery.

## Generating License Codes

Use the included CLI tool. You must use the **same secret** as the app (see Security below).

### Prerequisites

- Node.js 18+
- Install dependencies: `npm install`
- Optional: install `tsx` for running the generator without building: `npm install -D tsx`

### Usage

```bash
# Using npx tsx (recommended during development)
npx tsx scripts/license-generator.ts --device <DEVICE_ID> --type <TYPE> [--days N]

# Examples
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type TRIAL_7
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type TRIAL_30
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type STANDARD_365 --days 365
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type LIFETIME
```

- **Device ID**: The customer gets this from the activation screen (or from Settings → License after opening the app in demo mode). It is a 16-character string.
- **Type**: `TRIAL_7`, `TRIAL_30`, `STANDARD_365`, or `LIFETIME`.
- **--days**: Optional. Overrides the default duration for the chosen type (e.g. custom 90-day license).

### Output

The script prints the license code to stdout. Send this code to the customer; they enter it in the activation window on their device.

## Distributing Licenses to Customers

1. **Customer runs the app** on their machine. If no valid license is found, the **activation window** appears.
2. **Customer copies their Device ID** from the activation screen (or from Settings → License if they can open the app).
3. **Customer sends you the Device ID** (email, support ticket, etc.).
4. **You generate a license code** using the script above with that Device ID and the chosen type/duration.
5. **You send the license code** to the customer.
6. **Customer enters the code** in the activation window and clicks **Activate**. The app then opens normally.

**Important**: The same license code will **not** work on a different device (different Device ID). Each device needs its own code.

## User Flow

### First launch (no license)

1. App starts → no `.license.dat` or invalid/corrupt file.
2. Activation window is shown (main app window is not).
3. User sees their Device ID and an input for the license code.
4. User enters the code and clicks **Activate**.
5. If the code is valid and matches the device: license is saved, activation window closes, main app opens.
6. If the code is invalid/expired/wrong device: an error message is shown.

### Subsequent launches (valid license)

1. App starts → reads and validates `.license.dat`.
2. If valid and not expired: main app opens.
3. If expired or invalid: activation window is shown again.

### Settings → License

- Users can see license status, Device ID (for renewal or new activation), type, and days remaining.
- They can enter a new license code to activate or renew.

## Security

- **HMAC secret**: License codes are signed with `LICENSE_HMAC_SECRET`. Set this in the environment when generating codes and in production when running the app. If not set, a default is used (change in production).
- **Encryption**: The local license file is encrypted with AES-256-GCM. Set `LICENSE_ENCRYPTION_SECRET` for production.
- **Best practice**: Use strong, unique secrets in production and keep the generator and secrets only on your side (admin/support), not in the distributed app.

## Testing

1. **First activation**: Delete `.license.dat` from the app’s user data directory (or run on a clean machine), start the app → activation window should appear. Get the Device ID from the screen, generate a code with the script, activate → main app should open.
2. **Valid license**: After activation, restart the app → main app should open without showing the activation window.
3. **Invalid code**: In the activation window, enter a random string → error message.
4. **Expired license**: Use a code with an expiry in the past (or manually set the system clock forward) → activation window should appear again.
5. **Wrong device**: Use a license code generated for Device ID `AAAAAAAAAAAAAAAA` on a machine with a different Device ID → error that the code is for a different device.
6. **Tampering**: Manually edit `.license.dat` (e.g. change a byte) → app should treat the license as invalid and show the activation window.

## File Structure

- `src/main/licensing/device-fingerprint.ts` — Device ID from CPU, MAC, OS, RAM, hostname.
- `src/main/licensing/encryption.ts` — AES-256-GCM encrypt/decrypt for `.license.dat`.
- `src/main/licensing/license-manager.ts` — Check, activate, get info, expiry helpers.
- `scripts/license-generator.ts` — CLI to generate license codes.
- `src/renderer/activation.html` + `src/renderer/src/activation/main.ts` — Activation window UI.

## Environment Variables

| Variable | Purpose |
|----------|--------|
| `LICENSE_HMAC_SECRET` | Secret for signing/verifying license codes. Use the same value in the generator and the app. |
| `LICENSE_ENCRYPTION_SECRET` | Secret for encrypting the local `.license.dat` file. |

Set these in production for both the license generator (your admin environment) and the app (e.g. via Electron environment or config).
