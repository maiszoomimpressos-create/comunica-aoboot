"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { listWhatsappGroups } from "@/services/whatsapp-groups.service";

const schema = z.object({ connectionId: z.string().min(1) });

export const listWhatsappGroupsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId } = schema.parse(input);
    return listWhatsappGroups(ctx.tenantId, connectionId);
  }
);
