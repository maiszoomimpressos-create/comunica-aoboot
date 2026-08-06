import { z } from "zod";
import { createApiKeyHandler } from "@/lib/api/v1/api-key-handler";
import { sendPurchaseConfirmation } from "@/services/whatsapp-connection.service";

const bodySchema = z.object({
  to: z.string().min(8, "Informe o número de destino."),
  message: z.string().min(1, "Informe a mensagem."),
  qrData: z.string().min(1, "Informe o dado a ser codificado no QR code."),
});

/**
 * Called server-to-server by an external system (e.g. an e-commerce site)
 * right after a sale, to send the customer a WhatsApp purchase confirmation
 * with a QR code. Authenticated by a per-connection API key (see
 * lib/api/v1/api-key-handler.ts), not a dashboard session — no tenantSlug
 * needed, the key alone resolves the connection.
 */
export const POST = createApiKeyHandler({
  bodySchema,
  handler: async ({ body, apiKey }) => sendPurchaseConfirmation(apiKey, body),
});
