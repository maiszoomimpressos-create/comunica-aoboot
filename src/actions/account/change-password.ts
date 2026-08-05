"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const schema = z.object({
  currentPassword: z.string().min(1, "Informe sua senha atual."),
  newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres."),
});

export async function changePassword(
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
    await getAuthenticatedUser();
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
    });
    return actionOk(null);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
