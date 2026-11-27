"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { setPresenceTrackingEnabled } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
});

/** Tenant-facing: liga/desliga o rastreamento de presença (online/
 * digitando/gravando áudio) desta conexão — ver
 * setPresenceTrackingEnabled em whatsapp-connection.service.ts. */
export const updateConnectionPresenceTrackingAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return setPresenceTrackingEnabled(ctx.tenantId, parsed.connectionId, parsed.enabled);
  }
);
