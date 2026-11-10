"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { setContactOptOutStatus, getContactConnectionId } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ contactId: z.string().min(1), optedOut: z.boolean() });

/** Tenant-facing: manual bloqueio/desbloqueio de um contato pelo painel
 * (fonte "manual" — distinta do opt-out automático por palavra-chave, ver
 * whatsapp-contacts.service.ts). */
export const setContactOptOutAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { contactId, optedOut } = schema.parse(input);
    assertConnectionAccess(ctx, await getContactConnectionId(ctx.tenantId, contactId));
    await setContactOptOutStatus(ctx.tenantId, contactId, optedOut);
    return null;
  }
);
