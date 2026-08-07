import { z } from "zod";
import { createApiKeyHandler } from "@/lib/api/v1/api-key-handler";
import { sendPurchaseConfirmation } from "@/services/whatsapp-connection.service";

const bodySchema = z.object({
  to: z
    .string()
    .min(10, "Informe o número no formato DDI + DDD + número, só dígitos (ex: 5511999999999)."),
  buyerName: z.string().min(1, "Informe o nome do comprador."),
  qrData: z.string().min(1, "Informe o dado a ser codificado no QR code."),
});

/**
 * Called server-to-server by an external system (e.g. an e-commerce site)
 * right after a sale, to send the customer a WhatsApp purchase confirmation
 * with a QR code. Authenticated by a per-connection API key (see
 * lib/api/v1/api-key-handler.ts), not a dashboard session — no tenantSlug
 * needed, the key alone resolves the connection.
 *
 * The caller only supplies `buyerName` (the name registered for this sale
 * in their own system) — the actual message text is built by us, combining
 * it with the recipient's WhatsApp display name (best-effort) and the
 * tenant's configured business name (Minha Empresa). See
 * whatsapp-connection.service.ts's buildPurchaseConfirmationMessage.
 */
export const POST = createApiKeyHandler({
  bodySchema,
  handler: async ({ body, apiKey }) => sendPurchaseConfirmation(apiKey, body),
});
