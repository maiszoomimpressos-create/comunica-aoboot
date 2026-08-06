"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { revokeApiKey } from "@/services/whatsapp-connection.service";

const schema = z.object({ connectionId: z.string().min(1) });

export const revokeWhatsappApiKeyAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await revokeApiKey(ctx.tenantId, parsed.connectionId);
    return { ok: true };
  }
);
