"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { adminCreatePlan, adminUpdatePlan } from "@/repositories/subscription.repository";

const schema = z.object({
  planId: z.string().optional(),
  name: z.string().min(2, "Informe o nome do plano."),
  slug: z.string().min(2, "Informe o identificador do plano."),
  priceCents: z.coerce.number().int().min(0),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  maxUsers: z.coerce.number().int().min(0).nullable().optional(),
  maxModules: z.coerce.number().int().min(0).nullable().optional(),
  isActive: z.boolean(),
});

export const upsertPlanAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const features = {
      users: parsed.maxUsers ?? null,
      modules: parsed.maxModules ?? null,
    };

    if (parsed.planId) {
      await adminUpdatePlan(parsed.planId, {
        name: parsed.name,
        slug: parsed.slug,
        priceCents: parsed.priceCents,
        interval: parsed.interval,
        features,
        isActive: parsed.isActive,
      });
    } else {
      await adminCreatePlan({
        name: parsed.name,
        slug: parsed.slug,
        priceCents: parsed.priceCents,
        interval: parsed.interval,
        features,
        isActive: parsed.isActive,
        sortOrder: 99,
      });
    }
    return { ok: true };
  }
);
