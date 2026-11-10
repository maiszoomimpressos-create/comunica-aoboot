"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { retestConnection } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ connectionId: z.string().min(1) });

export const retestWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return retestConnection(ctx.tenantId, parsed.connectionId);
  }
);
