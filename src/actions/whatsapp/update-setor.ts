"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateSetor } from "@/services/setor.service";

const schema = z.object({
  setorId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  attendants: z.array(z.object({ phone: z.string().min(1), label: z.string().optional() })).min(1),
});

/** Tenant-facing: substitui nome/descrição e a lista de atendentes inteira
 * de um setor — ver updateSetorRecord em setor.repository.ts pro porquê de
 * delete-all-then-recreate em vez de diff. */
export const updateSetorAction = defineTenantAction("whatsapp.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  return updateSetor(ctx.tenantId, parsed.setorId, {
    name: parsed.name,
    description: parsed.description ?? null,
    attendants: parsed.attendants.map((a) => ({ phone: a.phone, label: a.label ?? null })),
  });
});
