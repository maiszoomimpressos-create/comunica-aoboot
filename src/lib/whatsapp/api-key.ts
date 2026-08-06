import { randomBytes, createHash } from "node:crypto";

const KEY_PREFIX = "bw_live_";

/**
 * Generates a new API key for machine-to-machine calls (external systems
 * triggering a WhatsApp send). Only `hash` is ever persisted — `plaintext`
 * is returned once, at generation time, and the caller (a Server Action)
 * must show it to the user immediately since it can never be recovered
 * again. `prefix` is safe to store/display for identification purposes.
 *
 * A plain SHA-256 hash (not bcrypt/scrypt) is intentional and correct here:
 * unlike a user-chosen password, this key is already high-entropy random
 * data (32 bytes), so there's no offline brute-force risk to slow down —
 * this is the same approach Stripe/GitHub use for their API keys.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${raw}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, KEY_PREFIX.length + 8),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
