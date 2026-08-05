"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const schema = z.object({ email: z.string().email("E-mail inválido.") });

export async function requestPasswordReset(
  input: z.infer<typeof schema>
): Promise<ActionResult<null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFail({ code: "VALIDATION_ERROR", message: "E-mail inválido." });
  }

  try {
    await auth.api.requestPasswordReset({ body: { email: parsed.data.email } });
  } catch (err) {
    // Deliberately swallow: never reveal whether an e-mail exists.
    console.error(toErrorPayload(err));
  }
  return actionOk(null);
}
