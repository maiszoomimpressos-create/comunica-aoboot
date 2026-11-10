"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { deleteTenant } from "@/repositories/admin.repository";

const schema = z.object({ tenantId: z.string().min(1) });

export const deleteTenantAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await deleteTenant(parsed.tenantId);
    return { ok: true };
  }
);
