"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createCampaign } from "@/services/campaign.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import {
  CAMPAIGN_PART_TYPES,
  DEFAULT_PART_INTERVAL,
  MAX_CAMPAIGN_PARTS,
  PART_TEXT_MAX_LENGTH,
} from "@/lib/campaigns/sequence";

const schema = z.object({
  connectionId: z.string().min(1),
  listId: z.string().min(1),
  name: z.string().min(1, "Informe um nome para a campanha."),
  parts: z
    .array(
      z.object({
        type: z.enum(CAMPAIGN_PART_TYPES),
        text: z.string().max(PART_TEXT_MAX_LENGTH).nullable().default(null),
        mediaUrl: z.string().max(2000).nullable().default(null),
        fileName: z.string().max(200).nullable().default(null),
      })
    )
    .min(1, "Adicione pelo menos uma mensagem.")
    .max(MAX_CAMPAIGN_PARTS, `No máximo ${MAX_CAMPAIGN_PARTS} mensagens por campanha.`),
  minPartIntervalSeconds: z.number().int().default(DEFAULT_PART_INTERVAL.min),
  maxPartIntervalSeconds: z.number().int().default(DEFAULT_PART_INTERVAL.max),
  coldOutreachConfirmed: z.boolean().default(false),
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
  async (ctx, input: z.input<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return createCampaign(ctx.tenantId, parsed);
  }
);
