"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { requestConnection } from "@/services/whatsapp-connection.service";

const schema = z.object({
  productKeys: z.array(z.string()).min(1, "Selecione ao menos um produto."),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
});

/** Tenant-facing: records interest in one or more WhatsApp products + a
 * phone number — no credentials involved. A platform admin provisions the
 * real Z-API connection afterward (see actions/admin/provision-whatsapp-connection.ts). */
export const requestWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return requestConnection(ctx.tenantId, parsed);
  }
);
