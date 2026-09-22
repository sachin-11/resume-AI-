import { randomBytes } from "crypto";

/**
 * CSPRNG temp/portal password (12 base64url chars, ~72 bits of entropy).
 * Math.random() is not cryptographically secure and its output is predictable
 * given enough samples — unsuitable for anything used as a login credential.
 */
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}
