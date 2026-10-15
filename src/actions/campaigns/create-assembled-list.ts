"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createAssembledContactList } from "@/services/whatsapp-contacts.service";

const schema = z.object({ name: z.string().min(1, "Informe um nome para a lista.") });

export const createAssembledListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { name } = schema.parse(input);
    return createAssembledContactList(ctx.tenantId, name);
  }
);
