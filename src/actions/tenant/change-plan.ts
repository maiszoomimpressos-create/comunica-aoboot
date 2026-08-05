"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { changePlan } from "@/repositories/subscription.repository";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/server/errors";

const schema = z.object({ planId: z.string().min(1) });

export const changePlanAction = defineTenantAction(
  "billing.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const plan = await prisma.plan.findUnique({ where: { id: parsed.planId, isActive: true } });
    if (!plan) throw new NotFoundError("Plano não encontrado.");
    await changePlan(ctx.tenantId, parsed.planId);
    return { ok: true };
  }
);
