import type { MiddlewareHandler } from "hono";
import { env, isProduction } from "@/config";
import { ForbiddenError } from "@/shared/errors";

/**
 * Helmet-equivalent security headers for Hono. Sets sensible defaults for
 * CSP, HSTS, X-Frame-Options, etc. Call `secureHeaders` before routes.
 */
export const secureHeaders: MiddlewareHandler = async (c, next) => {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };

  // HSTS only over HTTPS in production
  if (isProduction && c.req.url.startsWith("https")) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  const origin = c.req.header("origin");
  const csp = [
    "default-src 'self'",
    `connect-src 'self' ${env.APP_URL} ${env.CLIENT_URL} ${env.S3_PUBLIC_URL}`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' https:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ].join("; ");

  headers["Content-Security-Policy"] = csp;

  // CSRF: for state-changing requests, require the request to originate from
  // the configured client or an API bearer token (handled by auth middleware).
  if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    const token = c.req.header("authorization");
    const isSameOrigin =
      origin === undefined ||
      origin === env.CLIENT_URL ||
      origin === env.APP_URL ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1");

    const isApiRequest = token?.startsWith("Bearer ");

    // Allow when using bearer tokens or same-origin. External cross-origin
    // state changes are rejected unless they carry a valid CSRF token.
    const csrfToken = c.req.header("x-csrf-token");
    if (!isApiRequest && !isSameOrigin && csrfToken !== env.CSRF_SECRET) {
      throw new ForbiddenError("Cross-origin request blocked by CSRF protection");
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }

  await next();
};
