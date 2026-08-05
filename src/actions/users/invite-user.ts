"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createInvitation } from "@/repositories/invitation.repository";
import { getTenantById } from "@/repositories/tenant.repository";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/server/errors";
import { mailer } from "@/lib/notifications/mailer";
import { inviteMemberTemplate } from "@/lib/notifications/templates/invite-member";

const schema = z.object({
  email: z.string().email("E-mail inválido."),
  role: z.string().min(1, "Selecione um papel."),
});

export const inviteUserAction = defineTenantAction(
  "members.invite",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);

    const existingMember = await prisma.member.findFirst({
      where: { organizationId: ctx.tenantId, user: { email: parsed.email } },
    });
    if (existingMember) {
      throw new ConflictError("Este e-mail já faz parte da empresa.");
    }

    const inviter = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const tenant = await getTenantById(ctx.tenantId);

    const invitation = await createInvitation({
      tenantId: ctx.tenantId,
      email: parsed.email,
      role: parsed.role,
      inviterId: ctx.userId,
    });

    const url = `${process.env.NEXT_PUBLIC_APP_URL}/convite/${invitation.id}`;
    await mailer.send(
      inviteMemberTemplate({
        to: parsed.email,
        inviterName: inviter.name,
        tenantName: tenant.name,
        url,
      })
    );

    return { invitationId: invitation.id };
  }
);
