"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { setTenantStatus } from "@/repositories/admin.repository";

const schema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELED"]),
});

export const setTenantStatusAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await setTenantStatus(parsed.tenantId, parsed.status);
    return { ok: true };
  }
);
