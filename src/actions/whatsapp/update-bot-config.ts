"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { upsertBotConfig } from "@/repositories/bot.repository";

const schema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
  businessProfile: z.string().nullable(),
});

export const updateBotConfigAction = defineTenantAction(
  "whatsapp.bot.manage",
  async (_ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await upsertBotConfig(parsed.connectionId, {
      enabled: parsed.enabled,
      businessProfile: parsed.businessProfile,
    });
    return { ok: true };
  }
);
