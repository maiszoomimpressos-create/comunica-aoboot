"use server";

import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { createTenantForUser } from "@/services/onboarding.service";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const schema = z.object({ companyName: z.string().min(2, "Informe o nome da empresa.") });

export async function createAdditionalTenant(
  input: z.infer<typeof schema>
): Promise<ActionResult<{ tenantSlug: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFail({ code: "VALIDATION_ERROR", message: "Informe o nome da empresa." });
  }

  try {
    const user = await getAuthenticatedUser();
    const result = await createTenantForUser({
      userId: user.id,
      companyName: parsed.data.companyName,
    });
    return actionOk({ tenantSlug: result.tenantSlug });
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
