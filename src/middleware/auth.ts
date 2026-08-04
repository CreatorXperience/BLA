import type { Context, MiddlewareHandler } from "hono";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "@/utils/token";
import { prisma } from "@/database/prisma";
import { cached, cacheKey } from "@/database/redis";
import { ForbiddenError, UnauthorizedError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import type { AuthUser } from "@/shared/types";

const USER_CACHE_TTL = 120;

async function loadUser(userId: string): Promise<AuthUser> {
  return cached<AuthUser>(
    cacheKey("user", userId),
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, isEmailVerified: true, isActive: true },
      });
      if (!user) throw new UnauthorizedError("User no longer exists");
      return user;
    },
    USER_CACHE_TTL,
  );
}

/** Extract and verify the bearer access token, populating context.auth. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = header.slice(7);
  const payload = verifyAccessToken(token);

  const user = await loadUser(payload.sub);
  if (!user.isActive) {
    throw new ForbiddenError("Account is deactivated");
  }

  c.set("auth", {
    user,
    session: {
      sessionId: payload.sessionId,
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    },
  });

  await next();
};

/** Populates context.auth when a valid token is present; otherwise anonymous. */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      const user = await loadUser(payload.sub);
      if (user.isActive) {
        c.set("auth", {
          user,
          session: { sessionId: payload.sessionId },
        });
      }
    } catch (error) {
      logger.debug({ error }, "optional auth ignored invalid token");
    }
  }
  await next();
};

/** Role-based access control. Must be used after requireAuth. */
export function requireRole(...roles: Role[]): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth") as { user: AuthUser } | undefined;
    if (!auth?.user) {
      throw new UnauthorizedError("Authentication required");
    }
    if (!roles.includes(auth.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(" or ")}`);
    }
    await next();
  };
}

export function getAuthUser(c: Context): AuthUser | undefined {
  const auth = c.get("auth") as { user: AuthUser } | undefined;
  return auth?.user;
}

export function getAuth(c: Context): { user: AuthUser; session?: { sessionId?: string; ip?: string; userAgent?: string } } {
  const auth = c.get("auth") as { user: AuthUser; session?: { sessionId?: string; ip?: string; userAgent?: string } } | undefined;
  if (!auth?.user) throw new UnauthorizedError("Authentication required");
  return auth;
}
