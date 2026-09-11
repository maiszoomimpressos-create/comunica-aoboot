"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { setContactOptOutStatus } from "@/services/whatsapp-contacts.service";

const schema = z.object({ contactId: z.string().min(1), optedOut: z.boolean() });

/** Tenant-facing: manual bloqueio/desbloqueio de um contato pelo painel
 * (fonte "manual" — distinta do opt-out automático por palavra-chave, ver
 * whatsapp-contacts.service.ts). */
export const setContactOptOutAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { contactId, optedOut } = schema.parse(input);
    await setContactOptOutStatus(ctx.tenantId, contactId, optedOut);
    return null;
  }
);
