"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { removeContactFromListById } from "@/services/whatsapp-contacts.service";

const schema = z.object({ listId: z.string().min(1), contactId: z.string().min(1) });

export const removeContactFromListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId, contactId } = schema.parse(input);
    await removeContactFromListById(ctx.tenantId, listId, contactId);
    return null;
  }
);
