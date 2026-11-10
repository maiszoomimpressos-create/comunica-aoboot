"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionMetadata } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  connectionName: z.string().min(1, "Informe o nome da conexão."),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
  businessName: z.string().max(80, "Máximo de 80 caracteres.").optional().or(z.literal("")),
});

/** Tenant-facing: edits the connection's own name/phone-number/business-name
 * metadata — never the Z-API credentials, which stay admin-only (see
 * actions/admin/provision-whatsapp-connection.ts). */
export const updateWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return updateConnectionMetadata(ctx.tenantId, parsed.connectionId, {
      connectionName: parsed.connectionName,
      phoneNumber: parsed.phoneNumber,
      businessName: parsed.businessName?.trim() || null,
    });
  }
);
