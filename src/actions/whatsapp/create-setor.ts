"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createSetor } from "@/services/setor.service";

const schema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  attendants: z.array(z.object({ phone: z.string().min(1), label: z.string().optional() })).min(1),
});

/** Tenant-facing: cria um setor (departamento) com seu pool inicial de
 * atendentes — ver setor.service.ts pra validação e setor.repository.ts
 * pro schema (Setor/SetorAttendant). */
export const createSetorAction = defineTenantAction("whatsapp.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  return createSetor(ctx.tenantId, parsed.connectionId, {
    name: parsed.name,
    description: parsed.description ?? null,
    attendants: parsed.attendants.map((a) => ({ phone: a.phone, label: a.label ?? null })),
  });
});
