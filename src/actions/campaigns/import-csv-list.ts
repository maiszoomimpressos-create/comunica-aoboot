"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { importContactsFromCsv } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1, "Informe um nome para a lista."),
  csvText: z.string().min(1, "Selecione um arquivo CSV."),
});

/** Tenant-facing: cria uma lista montada a partir de um CSV de telefones —
 * ver whatsapp-contacts.service.ts's importContactsFromCsv. */
export const importCsvListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, name, csvText } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return importContactsFromCsv(ctx.tenantId, connectionId, name, csvText);
  }
);
