import type { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  isActive: boolean;
}

export interface SessionInfo {
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

/** Placed on context by the auth middleware. */
export interface AuthenticatedContext {
  user: AuthUser;
  session: SessionInfo;
}

/** Placed on context by the rate limiter / request logger. */
export interface RequestContext {
  requestId: string;
  rateLimit?: {
    remaining: number;
    limit: number;
    reset: number;
  };
}

export type Variables = {
  auth: AuthenticatedContext;
  request: RequestContext;
};
