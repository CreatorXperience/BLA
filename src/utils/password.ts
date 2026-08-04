import argon2 from "argon2";
import { env } from "@/config";

export interface PasswordHashOptions {
  type?: argon2.Options["type"];
  memoryCost?: number;
  timeCost?: number;
}

const DEFAULT_OPTIONS: PasswordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
};

/** Hash a password with Argon2id + a static application pepper. */
export async function hashPassword(
  password: string,
  options: PasswordHashOptions = DEFAULT_OPTIONS,
): Promise<string> {
  const peppered = `${env.PASSWORD_PEPPER}${password}`;
  return argon2.hash(peppered, options as argon2.Options);
}

/** Verify a plaintext password against an Argon2id hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const peppered = `${env.PASSWORD_PEPPER}${password}`;
    return await argon2.verify(hash, peppered);
  } catch {
    return false;
  }
}

export async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, DEFAULT_OPTIONS as argon2.Options);
}
