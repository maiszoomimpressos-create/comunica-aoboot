"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { provisionConnection } from "@/services/whatsapp-connection.service";

const schema = z.object({
  tenantId: z.string().min(1),
  connectionId: z.string().min(1),
  apiUrl: z.string().min(1, "Informe a URL da instância."),
  apiToken: z.string().min(1, "Informe o token da API."),
});

/** Platform-admin-only: fills in the real Z-API credentials for a tenant's
 * pending WhatsApp connection request (see /admin/whatsapp). Re-validates
 * the credentials server-side before persisting — see
 * whatsapp-connection.service.ts's provisionConnection for the full flow. */
export const provisionWhatsappConnectionAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return provisionConnection(parsed.tenantId, parsed.connectionId, {
      apiUrl: parsed.apiUrl,
      apiToken: parsed.apiToken,
    });
  }
);
