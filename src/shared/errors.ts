/**
 * Application error hierarchy.
 *
 * Controllers never implement business logic; they translate thrown errors
 * into HTTP responses via the global error handler. Services throw these.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "EMAIL_NOT_VERIFIED"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "RATE_LIMITED"
  | "INSUFFICIENT_STOCK"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_FAILED"
  | "COUPON_INVALID"
  | "COUPON_EXPIRED"
  | "COUPON_LIMIT_REACHED"
  | "SHIPPING_UNAVAILABLE"
  | "INTERNAL_ERROR";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  EMAIL_NOT_VERIFIED: 403,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  RATE_LIMITED: 429,
  INSUFFICIENT_STOCK: 409,
  PAYMENT_REQUIRED: 402,
  PAYMENT_FAILED: 402,
  COUPON_INVALID: 422,
  COUPON_EXPIRED: 422,
  COUPON_LIMIT_REACHED: 422,
  SHIPPING_UNAVAILABLE: 422,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code] ?? 500;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super("NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super("UNAUTHORIZED", message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action", details?: unknown) {
    super("FORBIDDEN", message, details);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", details?: unknown) {
    super("CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = "Invalid email or password") {
    super("INVALID_CREDENTIALS", message);
    this.name = "InvalidCredentialsError";
  }
}

export class InsufficientStockError extends AppError {
  constructor(message = "Insufficient stock available", details?: unknown) {
    super("INSUFFICIENT_STOCK", message, details);
    this.name = "InsufficientStockError";
  }
}

export class PaymentError extends AppError {
  constructor(message = "Payment failed", details?: unknown) {
    super("PAYMENT_FAILED", message, details);
    this.name = "PaymentError";
  }
}

export class CouponError extends AppError {
  constructor(message = "Coupon is not valid", details?: unknown) {
    super("COUPON_INVALID", message, details);
    this.name = "CouponError";
  }
}
