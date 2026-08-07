import { z } from "zod";
import { createApiKeyHandler } from "@/lib/api/v1/api-key-handler";
import { sendPurchaseConfirmation } from "@/services/whatsapp-connection.service";

const bodySchema = z.object({
  to: z
    .string()
    .min(10, "Informe o número no formato DDI + DDD + número, só dígitos (ex: 5511999999999)."),
  // Validated against the notification-type catalog inside the service
  // (not here) — keeps the list of valid types in one place as it grows.
  type: z.string().optional(),
  recipientName: z.string().min(1, "Informe o nome de quem vai receber."),
  details: z.record(z.string(), z.string()).optional(),
  qrData: z.string().min(1).optional(),
});

/**
 * Called server-to-server by an external system (e-commerce, ticketing,
 * booking, ...) right after something happens worth notifying a customer
 * about, to send them a WhatsApp message — optionally with a QR code (a
 * ticket, a voucher, ...). Authenticated by a per-connection API key (see
 * lib/api/v1/api-key-handler.ts), not a dashboard session — no tenantSlug
 * needed, the key alone resolves the connection.
 *
 * The caller only supplies structured data (`type`, `recipientName`,
 * `details`) — never free text. The actual message is built by us from the
 * notification-type catalog (src/config/whatsapp-notification-types.ts),
 * combining it with the recipient's WhatsApp display name (best-effort)
 * and the tenant's configured business name (Minha Empresa). `qrData` is
 * required only for types that need one (tickets, vouchers — anything
 * meant to be scanned); omitting it sends plain text instead of an image.
 * `type` defaults to the generic "compra_confirmada" when omitted.
 */
export const POST = createApiKeyHandler({
  bodySchema,
  handler: async ({ body, apiKey }) => sendPurchaseConfirmation(apiKey, body),
});
