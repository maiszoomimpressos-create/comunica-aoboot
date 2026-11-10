"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { rotateApiKey } from "@/services/whatsapp-connection.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ connectionId: z.string().min(1) });

/** Generates (or replaces) the API key for a connection — the plaintext is
 * only ever returned here, once, by the caller/UI. */
export const rotateWhatsappApiKeyAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    const apiKey = await rotateApiKey(ctx.tenantId, parsed.connectionId);
    return { apiKey };
  }
);
