# ---- Builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json scripts ./scripts/
COPY src ./src
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
