"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const schema = z.object({ name: z.string().min(2, "Informe seu nome.") });

export async function updateProfile(
  input: z.infer<typeof schema>
): Promise<ActionResult<null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFail({ code: "VALIDATION_ERROR", message: "Informe seu nome." });
  }

  try {
    await getAuthenticatedUser();
    await auth.api.updateUser({
      headers: await headers(),
      body: { name: parsed.data.name },
    });
    return actionOk(null);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
