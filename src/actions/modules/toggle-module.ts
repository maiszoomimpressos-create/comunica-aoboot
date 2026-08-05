"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { setModuleInstalled } from "@/repositories/module.repository";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/server/errors";

const schema = z.object({ moduleId: z.string().min(1), installed: z.boolean() });

export const toggleModuleAction = defineTenantAction(
  "modules.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const module_ = await prisma.module.findUnique({ where: { id: parsed.moduleId } });
    if (!module_) throw new NotFoundError("Módulo não encontrado.");
    if (module_.isComingSoon) {
      throw new ConflictError("Este módulo ainda não está disponível.");
    }
    await setModuleInstalled(ctx.tenantId, parsed.moduleId, parsed.installed);
    return { ok: true };
  }
);
