"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createConnection } from "@/services/whatsapp-connection.service";

const schema = z.object({
  providerId: z.string().min(1),
  connectionName: z.string().min(2, "Informe um nome para a conexão."),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
  apiUrl: z.string().min(1, "Informe a URL da instância."),
  apiToken: z.string().optional().default(""),
});

/** Re-validates the credentials server-side and, only on success, persists
 * the connection (see whatsapp-connection.service.ts for the full flow). */
export const createWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return createConnection(ctx.tenantId, parsed);
  }
);
