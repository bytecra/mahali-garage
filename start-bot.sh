#!/bin/bash
cd /volume1/home/ali-aldahami/Projects/mahali-garage
export TELEGRAM_BOT_TOKEN="8649368360:AAELc2RP4TIbrYh-Ru2MRO15LiMzEMjHaLw"
export TELEGRAM_OWNER_ID="1044340193"
export LICENSE_HMAC_SECRET="0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a"
npm install
npx tsx scripts/telegram-bot.ts