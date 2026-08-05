"use server";

import { z } from "zod";
import {
  findPendingInvitationById,
  markInvitationAccepted,
} from "@/repositories/invitation.repository";
import { getOptionalAuthenticatedUser } from "@/lib/server/request-context";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { actionOk, actionFail, type ActionResult } from "@/types/action";
import { toErrorPayload, NotFoundError, ForbiddenError } from "@/lib/server/errors";

async function joinTenant(invitationId: string, userId: string) {
  const invitation = await findPendingInvitationById(invitationId);
  if (!invitation) throw new NotFoundError("Convite inválido ou expirado.");

  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
    create: { organizationId: invitation.organizationId, userId, role: invitation.role },
    update: {},
  });
  await markInvitationAccepted(invitation.id);
  return { tenantSlug: invitation.organization.slug };
}

/** For an e-mail that already has an account — must be signed in as that exact e-mail. */
export async function acceptInvitationAsExistingUser(
  invitationId: string
): Promise<ActionResult<{ tenantSlug: string }>> {
  try {
    const invitation = await findPendingInvitationById(invitationId);
    if (!invitation) {
      return actionFail({ code: "NOT_FOUND", message: "Convite inválido ou expirado." });
    }
    const user = await getOptionalAuthenticatedUser();
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenError("Faça login com o e-mail convidado para aceitar.");
    }
    const result = await joinTenant(invitationId, user.id);
    return actionOk(result);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}

const newUserSchema = z.object({
  invitationId: z.string().min(1),
  name: z.string().min(2, "Informe seu nome."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

/** For an e-mail with no existing account — creates it, then joins. */
export async function acceptInvitationAsNewUser(
  input: z.infer<typeof newUserSchema>
): Promise<ActionResult<{ tenantSlug: string }>> {
  const parsed = newUserSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    });
  }

  try {
    const invitation = await findPendingInvitationById(parsed.data.invitationId);
    if (!invitation) {
      return actionFail({ code: "NOT_FOUND", message: "Convite inválido ou expirado." });
    }

    const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing) {
      throw new ForbiddenError("Já existe uma conta com este e-mail. Faça login para aceitar.");
    }

    const signUpResult = await auth.api.signUpEmail({
      body: { name: parsed.data.name, email: invitation.email, password: parsed.data.password },
    });

    const result = await joinTenant(parsed.data.invitationId, signUpResult.user.id);
    return actionOk(result);
  } catch (err) {
    return actionFail(toErrorPayload(err));
  }
}
