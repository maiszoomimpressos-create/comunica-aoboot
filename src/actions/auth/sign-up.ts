"use server";

import { z } from "zod";
import { createTenantWithOwner } from "@/services/onboarding.service";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload } from "@/lib/server/errors";

const signUpSchema = z.object({
  companyName: z.string().min(2, "Informe o nome da empresa."),
  userName: z.string().min(2, "Informe seu nome."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export async function signUp(
  input: SignUpInput
): Promise<ActionResult<{ tenantSlug: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      details: parsed.error.flatten(),
    });
  }

  try {
    const result = await createTenantWithOwner(parsed.data);
    return actionOk({ tenantSlug: result.tenantSlug });
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
