"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateRoleConnectionScope } from "@/repositories/role.repository";
import { NotFoundError } from "@/lib/server/errors";

const schema = z.object({
  roleId: z.string().min(1),
  enabled: z.boolean(),
  connectionIds: z.array(z.string()),
});

export const updateRoleConnectionScopeAction = defineTenantAction(
  "roles.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const result = await updateRoleConnectionScope(ctx.tenantId, parsed.roleId, {
      enabled: parsed.enabled,
      connectionIds: parsed.connectionIds,
    });
    if (!result) throw new NotFoundError("Papel não encontrado.");
    return { ok: true };
  }
);
