"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { addContactsToList } from "@/services/whatsapp-contacts.service";

const schema = z.object({
  listId: z.string().min(1),
  contactIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um contato."),
});

export const addContactsToListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId, contactIds } = schema.parse(input);
    const added = await addContactsToList(ctx.tenantId, listId, contactIds);
    return { added };
  }
);
