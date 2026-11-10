"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionEnabledNotificationTypes } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  types: z.array(z.string()),
});

/** Tenant-facing: sets which notification types (config/whatsapp-notification-types.ts)
 * this connection's API key is allowed to send. */
export const updateEnabledNotificationTypesAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return updateConnectionEnabledNotificationTypes(ctx.tenantId, parsed.connectionId, parsed.types);
  }
);
