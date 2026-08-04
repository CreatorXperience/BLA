import type { Context, ErrorHandler, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { failure } from "@/shared/apiResponse";

function handleAppError(c: Context, error: AppError): Response {
  if (error.statusCode >= 500) {
    logger.error({ error, path: c.req.path }, error.message);
  }
  return c.json(failure(error.message, error.code, error.details), error.statusCode as ContentfulStatusCode);
}

function handleZodError(c: Context, error: ZodError): Response {
  return c.json(
    failure("Validation failed", "VALIDATION_ERROR", error.flatten()),
    422,
  );
}

function handlePrismaError(c: Context, error: Prisma.PrismaClientKnownRequestError): Response {
  if (error.code === "P2002") {
    const target = (error.meta?.target as string[] | undefined)?.join(", ");
    return c.json(
      failure(`A record with these values already exists${target ? ` (${target})` : ""}`, "CONFLICT"),
      409,
    );
  }
  if (error.code === "P2025") {
    return c.json(failure("Resource not found", "NOT_FOUND"), 404);
  }
  if (error.code === "P2003") {
    return c.json(failure("Related record constraint violation", "CONFLICT"), 409);
  }
  logger.error({ error, path: c.req.path }, "prisma error");
  return c.json(failure("Database error", "INTERNAL_ERROR"), 500);
}

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof AppError) return handleAppError(c, error);
  if (error instanceof ValidationError) return handleAppError(c, error);
  if (error instanceof ZodError) return handleZodError(c, error);
  if (error instanceof HTTPException) {
    return c.json(failure(error.message, "HTTP_ERROR", { status: error.status }), error.status);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(c, error);
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error({ error, path: c.req.path }, "prisma validation error");
    return c.json(failure("Invalid database query", "INTERNAL_ERROR"), 500);
  }

  logger.error({ error, path: c.req.path }, "unhandled error");
  const status = error instanceof Error && "status" in error ? Number((error as { status?: number }).status) : 500;
  const safeStatus = Number.isFinite(status) && status >= 400 && status < 600 ? status : 500;
  return c.json(
    failure(
      safeStatus >= 500 ? "Internal server error" : (error instanceof Error ? error.message : "Request failed"),
      "INTERNAL_ERROR",
    ),
    safeStatus as ContentfulStatusCode,
  );
};

export function withErrorHandler(app: { onError: (fn: ErrorHandler) => void }): void {
  app.onError(errorHandler);
}

export type { Next };
