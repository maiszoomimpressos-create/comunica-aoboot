"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { softDeleteCustomNotificationTypeForConnection } from "@/services/custom-notification-type.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
});

/** Tenant-facing: soft-delete de uma função personalizada — o registro
 * permanece no banco (deletedAt), some da lista e deixa de ser disparável. */
export const deleteCustomNotificationTypeAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return softDeleteCustomNotificationTypeForConnection(ctx.tenantId, parsed.connectionId, parsed.key);
  }
);
