import jwt, { SignOptions } from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { env } from "@/config";
import { UnauthorizedError } from "@/shared/errors";

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: string;
  type: "access";
  sessionId?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
  jti: string; // refresh token row id
  sessionId?: string;
}

export interface EmailTokenPayload {
  sub: string;
  type: "email_verification" | "password_reset";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded === "string" || decoded.type !== "access") {
      throw new UnauthorizedError("Invalid token");
    }
    return decoded as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token expired");
    }
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Invalid access token");
  }
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  const opts: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"] };
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, opts);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof decoded === "string" || decoded.type !== "refresh") {
      throw new UnauthorizedError("Invalid token");
    }
    return decoded as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token expired");
    }
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Invalid refresh token");
  }
}

/**
 * Email verification / password reset tokens are opaque random strings.
 * Only their SHA-256 hash is stored so a DB leak does not expose valid tokens.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateVerificationCode(length = 6): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}
