import type { MiddlewareHandler } from "hono";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import { logger } from "@/shared/logger";

/**
 * Fire-and-forget audit logger. Call inside controllers after a mutation.
 * Business logic stays in services; this only records what happened.
 */
export async function recordAudit(params: {
  actorId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  c?: { req: { header: (name: string) => string | undefined } };
}): Promise<void> {
  const { actorId, action, entity, entityId, before, after, metadata, c } = params;

  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        before: before as Prisma.InputJsonValue | undefined,
        after: after as Prisma.InputJsonValue | undefined,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        ipAddress: c?.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: c?.req.header("user-agent"),
      },
    });
  } catch (error) {
    logger.error({ error, action, entity, entityId }, "audit log write failed");
  }
}

/** Middleware that automatically audits every mutation on a route. */
export function auditMiddleware(
  entity: string,
  actionFactory?: (c: { req: { path: string } }) => AuditAction,
): MiddlewareHandler {
  return async (c, next) => {
    await next();

    const action = actionFactory ? actionFactory(c) : (c.req.method as unknown as AuditAction);
    if (c.res.status < 400) {
      await recordAudit({
        actorId: (c.get("auth") as { user?: { id: string } } | undefined)?.user?.id ?? null,
        action,
        entity,
        entityId: c.req.param("id"),
        metadata: { method: c.req.method, path: c.req.path },
        c,
      });
    }
  };
}
