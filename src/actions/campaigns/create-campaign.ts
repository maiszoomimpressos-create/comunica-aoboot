"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createCampaign } from "@/services/campaign.service";

const schema = z.object({
  connectionId: z.string().min(1),
  listId: z.string().min(1),
  name: z.string().min(1, "Informe um nome para a campanha."),
  messageText: z.string().min(1, "Informe o texto da mensagem."),
  mediaType: z.enum(["image", "video"]).nullable(),
  mediaUrl: z.string().nullable(),
  overrides: z.object({
    batchSize: z.number().int().positive().nullable(),
    minMessageIntervalSeconds: z.number().int().positive().nullable(),
    maxMessageIntervalSeconds: z.number().int().positive().nullable(),
    minBatchPauseSeconds: z.number().int().nonnegative().nullable(),
    maxBatchPauseSeconds: z.number().int().nonnegative().nullable(),
  }),
});

export const createCampaignAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return createCampaign(ctx.tenantId, parsed);
  }
);
