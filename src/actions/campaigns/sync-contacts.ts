"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { syncContactsFromConnection } from "@/services/whatsapp-contacts.service";

const schema = z.object({ connectionId: z.string().min(1) });

/** Tenant-facing: pulls the connected WhatsApp's address book into
 * `Contact` rows — see whatsapp-contacts.service.ts. */
export const syncContactsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId } = schema.parse(input);
    return syncContactsFromConnection(ctx.tenantId, connectionId);
  }
);
