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
  note: z.string().max(500, "Máximo de 500 caracteres.").optional(),
});

/**
 * Called server-to-server by an external system (e-commerce, ticketing,
 * booking, ...) right after something happens worth notifying a customer
 * about, to send them a WhatsApp message — optionally with a QR code (a
 * ticket, a voucher, ...). Authenticated by a per-connection API key (see
 * lib/api/v1/api-key-handler.ts), not a dashboard session — no tenantSlug
 * needed, the key alone resolves the connection.
 *
 * The caller mostly supplies structured data (`type`, `recipientName`,
 * `details`), not free text — the message itself is built by us from the
 * notification-type catalog (src/config/whatsapp-notification-types.ts),
 * combining it with the recipient's WhatsApp display name (best-effort)
 * and the tenant's configured business name (Minha Empresa). The one
 * exception is `note`: an optional free-text line appended on top of the
 * templated message (e.g. "Apresente esse ingresso na portaria do evento,
 * não perca") — additive only, never a replacement for the template.
 * `qrData` is required only for types that need one (tickets, vouchers —
 * anything meant to be scanned); omitting it sends plain text instead of
 * an image. `type` defaults to the generic "compra_confirmada" when
 * omitted.
 */
export const POST = createApiKeyHandler({
  bodySchema,
  handler: async ({ body, apiKey }) => sendPurchaseConfirmation(apiKey, body),
});
