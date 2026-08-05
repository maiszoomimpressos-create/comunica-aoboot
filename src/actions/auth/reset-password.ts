"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";
import { passwordSchema } from "@/lib/auth/password-policy";

const schema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export async function resetPassword(
  input: z.infer<typeof schema>
): Promise<ActionResult<null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFail({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    });
  }

  try {
    await auth.api.resetPassword({ body: parsed.data });
    return actionOk(null);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
