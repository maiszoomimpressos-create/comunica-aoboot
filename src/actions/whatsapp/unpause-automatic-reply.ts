"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { unpauseAutomaticReply } from "@/services/anti-loop.service";

const schema = z.object({
  connectionId: z.string().min(1),
  relaySessionId: z.string().min(1),
});

/** Tenant-facing: reativa o atendimento automático (fluxo e IA) de um
 * contato pausado pela proteção anti-loop. Fecha só a RelaySession PENDING
 * daquele contato no setor interno "Pausa automática (sistema)". */
export const unpauseAutomaticReplyAction = defineTenantAction(
  "whatsapp.bot.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    await unpauseAutomaticReply({
      tenantId: ctx.tenantId,
      connectionId: parsed.connectionId,
      relaySessionId: parsed.relaySessionId,
      actorUserId: ctx.userId,
    });
    return { ok: true };
  }
);
