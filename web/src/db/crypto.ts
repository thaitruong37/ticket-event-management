import { createHash, randomBytes } from "node:crypto";
import { argon2id, hash, verify } from "argon2";

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return hash(password, {
    type: argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashLoginAttemptKey(email: string, clientAddress: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}\0${clientAddress}`, "utf8")
    .digest("hex");
}
