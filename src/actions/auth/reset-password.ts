"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
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
