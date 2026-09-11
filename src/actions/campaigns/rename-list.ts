"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { renameContactList } from "@/services/whatsapp-contacts.service";

const schema = z.object({ listId: z.string().min(1), name: z.string().min(1, "Informe um nome para a lista.") });

export const renameContactListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId, name } = schema.parse(input);
    await renameContactList(ctx.tenantId, listId, name);
    return null;
  }
);
