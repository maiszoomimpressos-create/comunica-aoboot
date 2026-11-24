"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createManualContact } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  phone: z.string().min(1, "Informe o telefone.").max(40),
  name: z.string().max(200).nullable(),
  listId: z.string().min(1).nullable(),
});

/** Tenant-facing: cadastro manual de um contato (opcionalmente já numa
 * lista) — ver whatsapp-contacts.service.ts's createManualContact. */
export const createManualContactAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, ...rest } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return createManualContact(ctx.tenantId, connectionId, rest);
  }
);
