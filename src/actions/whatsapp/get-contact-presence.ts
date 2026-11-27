"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getContactPresenceStatus } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  phone: z.string().min(1),
});

/** Tenant-facing: último status de presença conhecido (online/digitando/
 * gravando áudio) de um contato nesta conexão — `null` quando nunca chegou
 * nenhum evento pra esse número. Ver setPresenceTrackingEnabled (liga o
 * rastreamento) e getContactPresenceStatus em whatsapp-connection.service.ts. */
export const getContactPresenceAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return getContactPresenceStatus(ctx.tenantId, parsed.connectionId, parsed.phone);
  }
);
