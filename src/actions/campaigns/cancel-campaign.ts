"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { cancelCampaign, getCampaignConnectionId } from "@/services/campaign.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ campaignId: z.string().min(1) });

export const cancelCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId } = schema.parse(input);
    assertConnectionAccess(ctx, await getCampaignConnectionId(ctx.tenantId, campaignId));
    return cancelCampaign(ctx.tenantId, campaignId);
  }
);
