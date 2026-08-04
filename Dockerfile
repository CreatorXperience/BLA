# ---- Builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# Placeholder so `prisma generate` works without a live database at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

# deps first for better layer caching
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./tsconfig.json
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund \
  && npm prune --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
