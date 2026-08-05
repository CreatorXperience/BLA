import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  APP_URL: z.string().default("http://localhost:4000"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  APP_NAME: z.string().default("ATELIER"),
  API_PREFIX: z.string().default("/api/v1"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  PASSWORD_PEPPER: z.string().default(""),
  CSRF_SECRET: z.string().default("csfr-secret"),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_CACHE_TTL: z.coerce.number().default(300),

  ORDER_PAYMENT_GRACE_MS: z.coerce.number().optional(),
  ORDER_PAYMENT_SWEEP_MS: z.coerce.number().optional(),

  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_BUCKET: z.string().default("atelier-media"),
  S3_PUBLIC_URL: z.string().default(""),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  PAYSTACK_SECRET_KEY: z.string().default(""),
  PAYSTACK_PUBLIC_KEY: z.string().default(""),
  PAYSTACK_WEBHOOK_SECRET: z.string().default(""),

  FLUTTERWAVE_SECRET_KEY: z.string().default(""),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().default(""),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().default(""),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default("ATELIER <no-reply@example.com>"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URL: z.string().default(""),

  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(25),
  IMAGE_COMPRESSION_QUALITY: z.coerce.number().default(80),

  DEFAULT_CURRENCY: z.string().default("NGN"),
  DEFAULT_COUNTRY: z.string().default("NG"),
  TAX_RATE_PERCENT: z.coerce.number().default(7.5),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().default(0),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export type Env = z.infer<typeof envSchema>;

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isDevelopment = env.NODE_ENV === "development";
