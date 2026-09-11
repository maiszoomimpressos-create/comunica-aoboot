"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionCampaignSettingsForTenant } from "@/services/campaign.service";

const schema = z.object({
  connectionId: z.string().min(1),
  sendWindowStart: z.string().min(1),
  sendWindowEnd: z.string().min(1),
  batchSize: z.number().int(),
  minMessageIntervalSeconds: z.number().int(),
  maxMessageIntervalSeconds: z.number().int(),
  minBatchPauseSeconds: z.number().int(),
  maxBatchPauseSeconds: z.number().int(),
  dailyLimit: z.number().int().nullable(),
  maxConsecutiveErrors: z.number().int(),
});

export const updateCampaignSettingsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, ...rest } = schema.parse(input);
    return updateConnectionCampaignSettingsForTenant(ctx.tenantId, connectionId, rest);
  }
);
