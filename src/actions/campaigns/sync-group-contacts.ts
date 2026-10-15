"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { syncContactsFromGroup } from "@/services/whatsapp-groups.service";

const schema = z.object({
  connectionId: z.string().min(1),
  groupId: z.string().min(1),
  groupName: z.string().min(1),
});

export const syncGroupContactsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, groupId, groupName } = schema.parse(input);
    return syncContactsFromGroup(ctx.tenantId, connectionId, groupId, groupName);
  }
);
