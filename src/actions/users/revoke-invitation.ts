"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { revokeInvitation } from "@/repositories/invitation.repository";

const schema = z.object({ invitationId: z.string().min(1) });

export const revokeInvitationAction = defineTenantAction(
  "members.invite",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await revokeInvitation(ctx.tenantId, parsed.invitationId);
    return { ok: true };
  }
);
