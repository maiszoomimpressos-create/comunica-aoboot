"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { pauseCampaign } from "@/services/campaign.service";

const schema = z.object({ campaignId: z.string().min(1) });

export const pauseCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId } = schema.parse(input);
    return pauseCampaign(ctx.tenantId, campaignId);
  }
);
