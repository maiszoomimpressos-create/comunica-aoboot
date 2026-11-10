"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { setSetorActive, getSetorConnectionId } from "@/services/setor.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ setorId: z.string().min(1), active: z.boolean() });

/** Tenant-facing: liga/desliga um setor sem apagar — setor inativo some do
 * enum dinâmico que a IA vê (ver listActiveSetoresWithAttendants). */
export const setSetorActiveAction = defineTenantAction("whatsapp.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  assertConnectionAccess(ctx, await getSetorConnectionId(ctx.tenantId, parsed.setorId));
  return setSetorActive(ctx.tenantId, parsed.setorId, parsed.active);
});
