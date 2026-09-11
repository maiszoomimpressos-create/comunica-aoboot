"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createContactList } from "@/services/whatsapp-contacts.service";

const schema = z.object({ connectionId: z.string().min(1), name: z.string().min(1, "Informe um nome para a lista.") });

export const createContactListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, name } = schema.parse(input);
    return createContactList(ctx.tenantId, connectionId, name);
  }
);
