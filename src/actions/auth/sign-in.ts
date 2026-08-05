"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const signInSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
});

export type SignInInput = z.infer<typeof signInSchema>;

export async function signIn(input: SignInInput): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    });
  }

  try {
    await auth.api.signInEmail({ body: parsed.data });
    return actionOk(null);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
