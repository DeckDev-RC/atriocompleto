import crypto from "node:crypto";
import { env } from "../config/env";

export function generateNumericCode(length = 6): string {
  const max = 10 ** length;
  const min = 10 ** (length - 1);
  const random = crypto.randomInt(min, max);
  return String(random);
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashSecurityValue(value: string): string {
  return crypto
    .createHmac("sha256", env.AUTH_SECURITY_SECRET)
    .update(value)
    .digest("hex");
}
