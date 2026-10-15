"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { syncExtractedList } from "@/services/whatsapp-groups.service";

const schema = z.object({ listId: z.string().min(1) });

export const syncExtractedListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId } = schema.parse(input);
    return syncExtractedList(ctx.tenantId, listId);
  }
);
