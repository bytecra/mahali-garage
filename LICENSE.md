# Mahali Garage - License Generation Guide

Complete reference for generating and managing license codes for all tiers.

---

## 📋 Quick Reference

### License Tiers & Pricing

| Tier | Price | Features | Max Users |
|------|-------|----------|-----------|
| **BASIC** | $99 | Quick Invoice, Parts, Vehicle Owners, Settings | 1 |
| **STANDARD** | $249 | + Job Cards, Vehicles, Reports, Tasks, Expenses, Calendar | 5 |
| **PREMIUM** | $499 | + Services Catalog, Advanced Job Cards, Backup | Unlimited |

---

## 🔑 HMAC Secret Key

**CRITICAL:** Keep this secret! Never share with customers.
```
0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a
```

---

## 🚀 Quick Start - Generate a License

### Step 1: Get Customer's Device ID

Customer installs app → Activation window shows Device ID (e.g., `1377E9FCEE924C97`)

### Step 2: Generate License Code
```bash
# Windows (PowerShell)
$env:LICENSE_HMAC_SECRET="0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a"
npx tsx scripts/license-generator.ts --device DEVICE_ID --type LICENSE_TYPE

# macOS/Linux (Terminal)
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts --device DEVICE_ID --type LICENSE_TYPE
```

### Step 3: Send License to Customer

Copy the generated license code and send via email/WhatsApp.

---

## 📝 All Available License Types

### BASIC Tier

#### Lifetime
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type BASIC_LIFETIME
```

#### 7-Day Trial
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type BASIC_TRIAL_7
```

#### 14-Day Trial
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type BASIC_TRIAL_14
```

---

### STANDARD Tier

#### Lifetime
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type STANDARD_LIFETIME
```

#### 14-Day Trial
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type STANDARD_TRIAL_14
```

#### 30-Day Trial
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type STANDARD_TRIAL_30
```

#### Yearly Subscription
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type STANDARD_YEARLY
```

---

### PREMIUM Tier

#### Lifetime
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type PREMIUM_LIFETIME
```

#### 30-Day Trial
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type PREMIUM_TRIAL_30
```

#### Yearly Subscription
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device DEVICE_ID \
  --type PREMIUM_YEARLY
```

---

## 💼 Real-World Examples

### Example 1: New Customer - Premium Lifetime

**Scenario:** Ahmed bought Premium license for $499

**Device ID:** `1377E9FCEE924C97`

**Command:**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device 1377E9FCEE924C97 \
  --type PREMIUM_LIFETIME
```

**Output:**
```
✅ License Generated Successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Device ID:    1377E9FCEE924C97
Tier:         PREMIUM
Duration:     Lifetime
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

License Code:

  1377E9FCEE924C97-PREMIUM_LIFETIME-0-97d183d4cbdba6ea201cedc8e85a5136

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Copy this code and send it to the customer.
⚠️  This code only works on the device with the matching Device ID.
```

**Send to Ahmed:**
```
Your Premium Lifetime License:
1377E9FCEE924C97-PREMIUM_LIFETIME-0-97d183d4cbdba6ea201cedc8e85a5136

Paste this in the activation window and click "Activate"
```

---

### Example 2: Trial Customer - Standard 30-Day

**Scenario:** Sara wants to try Standard tier

**Device ID:** `A1B2C3D4E5F6G7H8`

**Command:**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device A1B2C3D4E5F6G7H8 \
  --type STANDARD_TRIAL_30
```

**Output:**
```
✅ License Generated Successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Device ID:    A1B2C3D4E5F6G7H8
Tier:         STANDARD
Duration:     30 days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

License Code:

  A1B2C3D4E5F6G7H8-STANDARD_TRIAL_30-1774166400-a8f4e9c2d1b3a5f7e6d8c9b4a2f1e3d5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Trial expires in 30 days. After that, customer must purchase.

---

### Example 3: Renewal - Basic Yearly

**Scenario:** Mohammed's yearly license is expiring, renew for another year

**Device ID:** `9988776655443322`

**Command:**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a \
npx tsx scripts/license-generator.ts \
  --device 9988776655443322 \
  --type STANDARD_YEARLY
```

Send the new code to Mohammed before expiry.

---

## 🔍 License Code Format

**Format:**
```
DEVICE_ID-LICENSE_TYPE-EXPIRY_TIMESTAMP-SIGNATURE
```

**Example:**
```
1377E9FCEE924C97-PREMIUM_LIFETIME-0-97d183d4cbdba6ea201cedc8e85a5136
│                │                 │  │
│                │                 │  └─ HMAC signature (validates authenticity)
│                │                 └──── Expiry (0 = never expires)
│                └────────────────────── License type
└─────────────────────────────────────── Device ID (hardware fingerprint)
```

**Expiry Values:**
- `0` = Lifetime (never expires)
- `1774166400` = Unix timestamp (expires at that date/time)

---

## ✅ License Validation Rules

### What Gets Validated:

1. **Device ID Match**
   - License is bound to specific hardware
   - Cannot transfer to another PC
   - If customer changes PC, they need a new license

2. **Signature Verification**
   - HMAC signature validates the license wasn't tampered with
   - Uses the secret key to verify authenticity

3. **Expiry Check**
   - Trial/Yearly licenses check current date vs expiry
   - Lifetime licenses skip this check (expiry = 0)

4. **License Type**
   - Must be one of the valid types
   - Invalid types are rejected

---

## ❌ Common Errors & Solutions

### Error: "Invalid license code format or signature"

**Causes:**
- License code was modified/corrupted
- Wrong HMAC secret used during generation
- Copy-paste error (missing characters)

**Solution:**
- Regenerate the license with correct HMAC secret
- Ensure full code is copied (no spaces/line breaks)

---

### Error: "This license code is for a different device"

**Cause:** 
- Customer trying to use license on different PC
- Device ID doesn't match

**Solution:**
- Generate a new license for the new Device ID
- Or explain license is device-locked (policy)

---

### Error: "This license has already expired"

**Cause:**
- Trial period ended
- Yearly subscription expired

**Solution:**
- Customer must purchase/renew
- Generate new license with extended/lifetime duration

---

### Error: "LICENSE_HMAC_SECRET environment variable is not set"

**Cause:**
- Secret not set in terminal

**Solution (Windows):**
```powershell
$env:LICENSE_HMAC_SECRET="0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a"
```

**Solution (Mac/Linux):**
```bash
export LICENSE_HMAC_SECRET="0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a"
```

Or add to the command directly (shown in all examples above).

---

## 📊 Customer Tracking Template

Keep a record of licenses issued:

| Date | Customer | Device ID | Tier | Type | Expires | License Code | Status |
|------|----------|-----------|------|------|---------|--------------|--------|
| 2025-03-20 | Ahmed | 1377E9FC... | PREMIUM | Lifetime | Never | 1377E9FC...-PREMIUM_LIFETIME-0-... | Active |
| 2025-03-21 | Sara | A1B2C3D4... | STANDARD | 30-Day Trial | 2025-04-20 | A1B2C3D4...-STANDARD_TRIAL_30-... | Active |
| 2025-03-22 | Mohammed | 99887766... | STANDARD | Yearly | 2026-03-22 | 99887766...-STANDARD_YEARLY-... | Active |

---

## 🎯 Quick Copy Commands

### Most Common Use Cases

**Premium Lifetime (Most Popular):**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a npx tsx scripts/license-generator.ts --device DEVICE_ID --type PREMIUM_LIFETIME
```

**Standard Lifetime:**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a npx tsx scripts/license-generator.ts --device DEVICE_ID --type STANDARD_LIFETIME
```

**Basic Lifetime:**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a npx tsx scripts/license-generator.ts --device DEVICE_ID --type BASIC_LIFETIME
```

**Free Trial (30 Days Premium):**
```bash
LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a npx tsx scripts/license-generator.ts --device DEVICE_ID --type PREMIUM_TRIAL_30
```

---

## 🔐 Security Best Practices

### NEVER Share:
- ❌ The HMAC secret key
- ❌ The license-generator script
- ❌ Access to your development machine

### ALWAYS:
- ✅ Keep HMAC secret in a password manager
- ✅ Generate licenses on your secure computer only
- ✅ Keep a backup of the HMAC secret (encrypted)
- ✅ Track all issued licenses
- ✅ Verify customer payment before sending license

---

## 📞 Customer Support Template

**When customer asks for activation:**
```
Hi [Customer Name],

Thank you for purchasing Mahali Garage [TIER] License!

To activate your license:

1. Install Mahali Garage from: [DOWNLOAD_LINK]
2. Launch the app
3. Copy the Device ID shown in the activation window
4. Reply to this email with your Device ID
5. We'll send your activation code within 24 hours

Best regards,
[Your Name]
```

**After receiving Device ID:**
```
Hi [Customer Name],

Here is your Mahali Garage [TIER] License:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
License Code:
[GENERATED_LICENSE_CODE]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To activate:
1. Open Mahali Garage
2. Paste the code in the License Code field
3. Click "Activate"
4. You're all set! ✅

⚠️ Important:
- This license is bound to your current PC
- Keep this email for your records
- Contact us if you need to transfer to a new PC

Support: [YOUR_CONTACT]

Best regards,
[Your Name]
```

---

## 🆘 Troubleshooting Guide

### Customer: "Activation window is blank"

**Fix:**
- Production build issue
- Tell customer to reinstall using latest installer
- Or use `npm run dev` version for testing

### Customer: "Device ID keeps changing"

**Cause:**
- Hardware changes
- Virtual machine
- Windows reinstall

**Fix:**
- Generate new license for new Device ID
- Explain license is hardware-locked

### You: "Cannot generate license - script not found"

**Fix:**
```bash
# Make sure you're in the project folder
cd /path/to/mahali-garage

# Check if script exists
ls scripts/license-generator.ts

# If missing, the file might be in a different location
```

---

## 📚 Reference: All License Types
```
BASIC_LIFETIME       → $99 lifetime
BASIC_TRIAL_7        → 7 days free
BASIC_TRIAL_14       → 14 days free

STANDARD_LIFETIME    → $249 lifetime
STANDARD_TRIAL_14    → 14 days free
STANDARD_TRIAL_30    → 30 days free
STANDARD_YEARLY      → $249/year renewable

PREMIUM_LIFETIME     → $499 lifetime
PREMIUM_TRIAL_30     → 30 days free
PREMIUM_YEARLY       → $499/year renewable
```

---

## ✅ Checklist Before Issuing License

- [ ] Customer paid (or approved for trial)
- [ ] Received correct Device ID (16 characters)
- [ ] Verified which tier they purchased
- [ ] Generated license with correct type
- [ ] Tested license code (copy-paste works)
- [ ] Sent to customer with clear instructions
- [ ] Logged in customer tracking spreadsheet
- [ ] Confirmed activation successful

---

**Last Updated:** March 2025  
**Version:** 1.0.0  
**Mahali Garage License System**