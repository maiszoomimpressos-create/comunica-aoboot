import { z } from "zod";
import { createApiKeyHandler } from "@/lib/api/v1/api-key-handler";
import { sendBalanceAlert } from "@/services/whatsapp-connection.service";

const bodySchema = z.object({
  // Accepted as string or number and normalized to string — purely for
  // display in the message text (see sendBalanceAlert's BalanceAlertInput).
  saldo: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
});

/**
 * Called server-to-server by the tenant's own external wallet/spend-control
 * system whenever its balance drops to whatever threshold *it* decides —
 * this endpoint doesn't compute or store any balance itself, it just relays
 * an alert. Authenticated by the same per-connection API key as
 * purchase-confirmation (see lib/api/v1/api-key-handler.ts) — typically the
 * same key the caller already uses for that endpoint.
 *
 * Deliberately does NOT accept a destination number: the message always
 * fans out to the fixed list of up to 3 numbers the tenant registered in
 * the dashboard (Minhas Conexões → Alertas de saldo), never to a number
 * supplied by the caller.
 */
export const POST = createApiKeyHandler({
  bodySchema,
  handler: async ({ body, apiKey }) => sendBalanceAlert(apiKey, body),
});
