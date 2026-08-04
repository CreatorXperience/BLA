# ATELIER API

Production-ready backend for **ATELIER**, a premium luxury streetwear e-commerce brand.

- **Runtime:** Node.js 22+ · TypeScript · Hono
- **Database:** PostgreSQL 16 · Prisma ORM
- **Caching / Queues:** Redis · BullMQ
- **Auth:** JWT (access + refresh) · Argon2id · Google OAuth
- **Payments:** Paystack · Flutterwave (server-verified webhooks)
- **Media:** Cloudflare R2 / S3-compatible object storage · Sharp
- **Docs:** OpenAPI 3.1 + Swagger UI

## Architecture

Clean, module-based layout — every feature ships with its own validators, repository, service, controller, and routes:

```
src/
  config/        env + runtime config
  middleware/    auth, guards, rate limiting, security, logging, error handler
  modules/
    auth/ users/ products/ categories/ collections/ inventory/
    cart/ coupons/ shipping/ orders/ payments/ checkout/
    wishlist/ reviews/ media/ search/ analytics/ dashboard/ cms/ notifications/
  utils/         password, money, id, slug, token, prisma
  workers/       BullMQ workers (email, images, payments, inventory, …)
  swagger/       OpenAPI registry
  app.ts         Hono app assembly (buildApp)
  server.ts      HTTP bootstrap
```

All routes mount under `API_PREFIX` (default `/api/v1`).

## Getting started

```bash
cp .env.example .env        # then fill in real secrets
npm install
npm run prisma:generate
npm run prisma:migrate      # creates the schema (dev)
npm run prisma:seed         # sample luxury catalog + admin user
npm run dev                 # API on http://localhost:4000
npm run worker:dev          # queue workers in a second terminal
```

### Demo accounts (from seed)

| Role        | Email                   | Password        |
|-------------|-------------------------|-----------------|
| Super Admin | admin@atelier.example   | Admin@12345     |
| Customer    | customer@atelier.example | Customer@12345  |

> **Warning:** change these seeds and all secrets in `.env` before any real deployment.

## Key endpoints

| Endpoint                | Description                                  |
|-------------------------|----------------------------------------------|
| `GET /health`           | Service health check                         |
| `GET /docs`             | Swagger UI                                   |
| `GET /api/v1/openapi.json` | Generated OpenAPI document                |
| `POST /api/v1/auth/register` | Create a customer account               |
| `POST /api/v1/auth/login`    | Authenticate (returns JWT pair)          |
| `GET /api/v1/products`  | Published products (filter + paginate)       |
| `GET /api/v1/search`    | Full-text product search                     |
| `POST /api/v1/analytics/track` | Anonymous/authed event tracking        |

## Docker

```bash
docker compose up --build    # postgres + redis + api + worker
```

The API container runs `prisma migrate deploy` before booting; migrations are applied automatically. The `worker` service runs the BullMQ workers (email, payment verification, image processing, inventory alerts, analytics sync).

## Scripts

| Script                | Purpose                                   |
|-----------------------|-------------------------------------------|
| `npm run dev`         | Watch-mode API server (`tsx`)             |
| `npm run build`       | Bundle API + workers with esbuild          |
| `npm run start`       | Run the bundled API                        |
| `npm run typecheck`   | TypeScript type-check (no emit)            |
| `npm run test`        | Run Vitest unit + API tests                |
| `npm run worker:dev`  | Watch-mode BullMQ worker                   |
| `npm run worker:start`| Run the bundled worker                     |
| `npm run prisma:*`    | Generate / migrate / deploy / seed / studio|

## Design decisions

- **Money:** stored as `Decimal` in major units (₦), formatted only at the edge.
- **Order lifecycle:** an order is only `PAID` after its payment-provider webhook is verified — never the client redirect.
- **Inventory:** per-variant stock with reserved/incoming counters and low-stock alerts via queue.
- **Audit trail:** admin & CMS mutations write to `AuditLog` through `recordAudit`.
- **Caching:** hot reads (analytics, dashboard, catalog) are Redis-cached with targeted invalidation.

## Tests

```bash
npm run test         # unit (password/money/id) + API (health/openapi/docs)
```

API tests drive the assembled Hono app through `app.request()` — no database or Redis required for the base suite.
