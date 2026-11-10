"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { pauseCampaign, getCampaignConnectionId } from "@/services/campaign.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ campaignId: z.string().min(1) });

export const pauseCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId } = schema.parse(input);
    assertConnectionAccess(ctx, await getCampaignConnectionId(ctx.tenantId, campaignId));
    return pauseCampaign(ctx.tenantId, campaignId);
  }
);
