import { randomBytes } from "node:crypto";

/**
 * Generates a per-connection secret embedded in the webhook URL we give
 * Z-API (see app/api/webhooks/zapi/[connectionId]/route.ts) — plain,
 * compared directly on every inbound call, not hashed like the public API
 * key. Lower stakes than the API key (it only lets someone POST fake
 * events into our log, not send/read WhatsApp messages), and needs a fast
 * equality check on every webhook call, so hashing would add cost for no
 * real benefit here.
 */
export function generateWebhookSecret(): string {
  return randomBytes(24).toString("base64url");
}
