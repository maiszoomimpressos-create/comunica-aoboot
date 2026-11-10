"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionEnabledServices } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  services: z.array(z.string()),
});

/** Tenant-facing: sets which services (config/whatsapp-services.ts) this
 * connection's API key is allowed to call. */
export const updateEnabledServicesAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return updateConnectionEnabledServices(ctx.tenantId, parsed.connectionId, parsed.services);
  }
);
