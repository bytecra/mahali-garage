## Mahali Garage License Secret & Generator Usage

### 1. Generate a strong HMAC secret (one-time)

Run this **on a secure machine**, not on customer devices:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store this value securely (password manager, vault). **Do not commit it to git.**

### 2. Configure the app and generator

Set the secret as an environment variable before running the app or generator:

```bash
export LICENSE_HMAC_SECRET=your_generated_secret_here
```

### 3. Generate licenses

```bash
LICENSE_HMAC_SECRET=your_generated_secret_here \
  npx tsx scripts/license-generator.ts --device DEVICE_ID --type BASIC_LIFETIME
```

Supported types are documented in `scripts/license-generator.ts` (BASIC/STANDARD/PREMIUM, lifetime / trials / yearly).

### 4. Production notes

- Every environment (staging, production) should have its own `LICENSE_HMAC_SECRET`.
- Never ship the secret inside the binary or source code.
- If the secret is ever leaked, treat all existing licenses as compromised and rotate to a new secret.
