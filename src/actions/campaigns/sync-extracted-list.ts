"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { syncExtractedList } from "@/services/whatsapp-groups.service";
import { getListConnectionId } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ listId: z.string().min(1) });

export const syncExtractedListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId } = schema.parse(input);
    const connectionId = await getListConnectionId(ctx.tenantId, listId);
    if (connectionId) assertConnectionAccess(ctx, connectionId);
    return syncExtractedList(ctx.tenantId, listId);
  }
);
