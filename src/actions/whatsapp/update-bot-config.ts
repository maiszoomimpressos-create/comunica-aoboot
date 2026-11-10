"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { upsertBotConfig } from "@/repositories/bot.repository";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
  businessProfile: z.string().nullable(),
  verticalId: z.string().nullable(),
});

export const updateBotConfigAction = defineTenantAction(
  "whatsapp.bot.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    await upsertBotConfig(parsed.connectionId, {
      enabled: parsed.enabled,
      businessProfile: parsed.businessProfile,
      verticalId: parsed.verticalId,
    });
    return { ok: true };
  }
);
