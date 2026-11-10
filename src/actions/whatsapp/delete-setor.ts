"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteSetor, getSetorConnectionId } from "@/services/setor.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ setorId: z.string().min(1) });

/** Tenant-facing: exclui um setor — bloqueado (ConflictError) se houver
 * atendimento em andamento, ver deleteSetor em setor.service.ts. */
export const deleteSetorAction = defineTenantAction("whatsapp.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  assertConnectionAccess(ctx, await getSetorConnectionId(ctx.tenantId, parsed.setorId));
  return deleteSetor(ctx.tenantId, parsed.setorId);
});
