FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV TELEGRAM_BOT_TOKEN=8649368360:AAELc2RP4TIbrYh-Ru2MRO15LiMzEMjHaLw
ENV TELEGRAM_OWNER_ID=1044340193
ENV LICENSE_HMAC_SECRET=0f3466a0c8c1a0f22ab2313fbed729449dc996e286ef88f5bb41a8de72bf706a
ENV NODE_ENV=production

CMD ["npx", "tsx", "scripts/telegram-bot.ts"]