"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteContactList } from "@/services/whatsapp-contacts.service";

const schema = z.object({ listId: z.string().min(1) });

export const deleteContactListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId } = schema.parse(input);
    await deleteContactList(ctx.tenantId, listId);
    return null;
  }
);
