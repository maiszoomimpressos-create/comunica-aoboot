"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getMemberById, removeMember, countOwners } from "@/repositories/membership.repository";
import { ConflictError, NotFoundError } from "@/lib/server/errors";

const schema = z.object({ memberId: z.string().min(1) });

export const removeUserAction = defineTenantAction(
  "members.remove",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const member = await getMemberById(ctx.tenantId, parsed.memberId);
    if (!member) throw new NotFoundError("Usuário não encontrado nesta empresa.");

    if (member.role === "owner" && (await countOwners(ctx.tenantId)) <= 1) {
      throw new ConflictError("Não é possível remover o último Owner da empresa.");
    }

    await removeMember(ctx.tenantId, parsed.memberId);
    return { ok: true };
  }
);
