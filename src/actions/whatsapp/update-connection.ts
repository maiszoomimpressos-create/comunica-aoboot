"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionMetadata } from "@/services/whatsapp-connection.service";

const schema = z.object({
  connectionId: z.string().min(1),
  connectionName: z.string().min(1, "Informe o nome da conexão."),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
});

/** Tenant-facing: edits the connection's own name/phone-number metadata —
 * never the Z-API credentials, which stay admin-only (see
 * actions/admin/provision-whatsapp-connection.ts). */
export const updateWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return updateConnectionMetadata(ctx.tenantId, parsed.connectionId, {
      connectionName: parsed.connectionName,
      phoneNumber: parsed.phoneNumber,
    });
  }
);
