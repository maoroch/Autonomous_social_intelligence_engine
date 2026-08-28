FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared-lib/package.json ./shared-lib/
COPY services/telegram-bot/package.json ./services/telegram-bot/

RUN npm install --ignore-scripts

COPY tsconfig.base.json ./
COPY shared-lib ./shared-lib
COPY services/telegram-bot ./services/telegram-bot

RUN npm run build --workspace=@pipeline/shared
RUN npm run build --workspace=@pipeline/telegram-bot

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared-lib/dist ./shared-lib/dist
COPY --from=builder /app/shared-lib/package.json ./shared-lib/package.json
COPY --from=builder /app/services/telegram-bot/dist ./services/telegram-bot/dist
COPY --from=builder /app/services/telegram-bot/package.json ./services/telegram-bot/package.json

WORKDIR /app/services/telegram-bot

CMD ["node", "dist/index.js"]
