# Mahali Garage — Device-Based Licensing

This document describes how to generate, distribute, and test license codes for the Mahali Garage application.

## Overview

- **Device binding**: Each license code is bound to a specific device via a hardware fingerprint (Device ID).
- **Offline validation**: License is validated locally; no internet is required after activation.
- **Time-limited or lifetime**: Supports trial (7/30 days), 1-year, and lifetime licenses.
- **Storage**: Activated license is stored encrypted in the app's user data directory (`.license.dat`).

## License Tiers

### BASIC ($99)
- Quick Invoice (counter sales)
- Parts Inventory
- Vehicle Owners
- Settings
- 1 user

### STANDARD ($249)
- All BASIC features
- Job Cards (full repair management)
- Vehicles database
- Reports
- Expenses
- Tasks & Calendar
- Invoices
- 5 users

### PREMIUM ($499)
- All STANDARD features
- Services Catalog
- Advanced Job Card features (bay management, technician tracking)
- Backup & Restore
- Activity Log
- Unlimited users

## License Code Format

```
DEVICEID-TYPE-EXPIRY-SIGNATURE
```

Example: `A1B2C3D4E5F6G7H8-STANDARD_LIFETIME-0-9A8B7C6D5E4F3A2B1C0D1E2F3A4B5`

- **DEVICEID**: 16-character alphanumeric device fingerprint (shown in the activation window).
- **TYPE**: One of the supported license types (see generator).
- **EXPIRY**: Unix timestamp (seconds). Use `0` for LIFETIME.
- **SIGNATURE**: HMAC-SHA256 (first 32 hex chars) to prevent forgery.

## Generating License Codes

Use the included CLI tool. You must use the **same secret** as the app (see Security below).

### Prerequisites

- Node.js 18+
- Install dependencies: `npm install`

### Usage

```bash
npx tsx scripts/license-generator.ts --device <DEVICE_ID> --type <TYPE>

# Examples
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type BASIC_LIFETIME
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type STANDARD_LIFETIME
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type PREMIUM_LIFETIME
npx tsx scripts/license-generator.ts --device A1B2C3D4E5F6G7H8 --type STANDARD_TRIAL_30
```

## Security

- **HMAC secret**: License codes are signed with `LICENSE_HMAC_SECRET`. Set this in the environment when generating codes and in production when running the app.
- **Encryption**: The local license file is encrypted with AES-256-GCM. Set `LICENSE_ENCRYPTION_SECRET` for production.

## Environment Variables

| Variable | Purpose |
|----------|--------|
| `LICENSE_HMAC_SECRET` | Secret for signing/verifying license codes. |
| `LICENSE_ENCRYPTION_SECRET` | Secret for encrypting the local `.license.dat` file. |

## File Structure

- `src/main/licensing/device-fingerprint.ts` — Device ID generation.
- `src/main/licensing/encryption.ts` — AES-256-GCM encrypt/decrypt.
- `src/main/licensing/license-manager.ts` — License validation and feature gating.
- `scripts/license-generator.ts` — CLI license code generator.
- `src/renderer/activation.html` — Activation window UI.
