"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { cancelCampaign } from "@/services/campaign.service";

const schema = z.object({ campaignId: z.string().min(1) });

export const cancelCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId } = schema.parse(input);
    return cancelCampaign(ctx.tenantId, campaignId);
  }
);
