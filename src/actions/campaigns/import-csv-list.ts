"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { CSV_IMPORT_CHUNK_SIZE, importCsvChunk } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  /** null no primeiro pedaço (cria a lista); depois, o id devolvido. */
  listId: z.string().min(1).nullable(),
  name: z.string().min(1, "Informe um nome para a lista."),
  rows: z
    .array(z.object({ phone: z.string().max(40), name: z.string().max(200).nullable() }))
    .min(1, "O arquivo não tem nenhuma linha.")
    .max(CSV_IMPORT_CHUNK_SIZE),
});

/** Tenant-facing: importa UM pedaço de um CSV de telefones (o navegador lê
 * e parseia o arquivo e manda em pedaços de até CSV_IMPORT_CHUNK_SIZE
 * linhas, então arquivos grandes não batem no limite de 1 MB da Server
 * Action) — ver whatsapp-contacts.service.ts's importCsvChunk. */
export const importCsvListAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, listId, name, rows } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return importCsvChunk(ctx.tenantId, connectionId, { listId, listName: name, rows });
  }
);
