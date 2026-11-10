"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { listWhatsappGroups } from "@/services/whatsapp-groups.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ connectionId: z.string().min(1) });

export const listWhatsappGroupsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return listWhatsappGroups(ctx.tenantId, connectionId);
  }
);
