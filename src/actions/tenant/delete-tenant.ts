"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteTenantAsOwner } from "@/repositories/tenant.repository";
import { ForbiddenError, ValidationError } from "@/lib/server/errors";

const schema = z.object({ confirmSlug: z.string().min(1) });

/** Tenant-facing: exclusão definitiva da própria empresa, restrita ao papel
 * "owner" (não uma permissão granular toggleável — ver nota em
 * deleteTenantAsOwner) e exigindo o slug digitado de novo, checado aqui
 * também, nunca só no cliente (ver delete-tenant-button.tsx). */
export const deleteTenantAction = defineTenantAction(
  null,
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    if (ctx.roleKey !== "owner") {
      throw new ForbiddenError("Só o Owner da empresa pode excluí-la.");
    }
    if (parsed.confirmSlug !== ctx.tenantSlug) {
      throw new ValidationError("Identificador digitado não confere.");
    }
    await deleteTenantAsOwner(ctx.tenantId);
    return { ok: true };
  }
);
