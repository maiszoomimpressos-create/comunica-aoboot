"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateTenant } from "@/repositories/tenant.repository";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da empresa."),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use um hexadecimal, ex: #6d28d9.")
    .optional()
    .or(z.literal("")),
});

export const updateTenantAction = defineTenantAction(
  "tenant.update",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await updateTenant(ctx.tenantId, {
      name: parsed.name,
      primaryColor: parsed.primaryColor || null,
    });
    return { ok: true };
  }
);
