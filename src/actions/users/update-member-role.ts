"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getMemberById, updateMemberRole, countOwners } from "@/repositories/membership.repository";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/server/errors";

const schema = z.object({ memberId: z.string().min(1), roleKey: z.string().min(1) });

export const updateMemberRoleAction = defineTenantAction(
  "members.update_role",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const member = await getMemberById(ctx.tenantId, parsed.memberId);
    if (!member) throw new NotFoundError("Usuário não encontrado nesta empresa.");

    const roleExists = await prisma.role.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: parsed.roleKey } },
    });
    if (!roleExists) throw new ValidationError("Papel inválido.");

    if (member.role === "owner" && parsed.roleKey !== "owner" && (await countOwners(ctx.tenantId)) <= 1) {
      throw new ConflictError("Não é possível remover o último Owner da empresa.");
    }

    await updateMemberRole(ctx.tenantId, parsed.memberId, parsed.roleKey);
    return { ok: true };
  }
);
