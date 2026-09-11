"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { startCampaign } from "@/services/campaign.service";

const schema = z.object({ campaignId: z.string().min(1), consentConfirmed: z.boolean() });

export const startCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId, consentConfirmed } = schema.parse(input);
    return startCampaign(ctx.tenantId, campaignId, consentConfirmed);
  }
);
