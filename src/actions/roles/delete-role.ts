"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteRole } from "@/repositories/role.repository";
import { ConflictError, NotFoundError } from "@/lib/server/errors";

const schema = z.object({ roleId: z.string().min(1) });

export const deleteRoleAction = defineTenantAction(
  "roles.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    try {
      const result = await deleteRole(ctx.tenantId, parsed.roleId);
      if (!result) throw new NotFoundError("Papel não encontrado ou é um papel padrão.");
      return { ok: true };
    } catch (err) {
      if (err instanceof Error && err.message === "ROLE_IN_USE") {
        throw new ConflictError("Existem usuários com este papel — reatribua-os antes de excluir.");
      }
      throw err;
    }
  }
);
