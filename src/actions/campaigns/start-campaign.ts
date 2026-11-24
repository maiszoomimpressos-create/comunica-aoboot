"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { startCampaign, getCampaignConnectionId } from "@/services/campaign.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  campaignId: z.string().min(1),
  consentConfirmed: z.boolean(),
  /** ISO (com fuso) — null/ausente = começar agora. */
  scheduledStartAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const startCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId, consentConfirmed, scheduledStartAt } = schema.parse(input);
    assertConnectionAccess(ctx, await getCampaignConnectionId(ctx.tenantId, campaignId));
    return startCampaign(
      ctx.tenantId,
      campaignId,
      consentConfirmed,
      scheduledStartAt ? new Date(scheduledStartAt) : null
    );
  }
);
