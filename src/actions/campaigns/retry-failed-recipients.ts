"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { retryFailedRecipients, getCampaignConnectionId } from "@/services/campaign.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ campaignId: z.string().min(1) });

/** "Reenviar falhas": volta os destinatários FAILED pra fila (a campanha
 * fica PAUSED pra o tenant revisar e retomar). */
export const retryFailedRecipientsAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { campaignId } = schema.parse(input);
    assertConnectionAccess(ctx, await getCampaignConnectionId(ctx.tenantId, campaignId));
    return retryFailedRecipients(ctx.tenantId, campaignId);
  }
);
