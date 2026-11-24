"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { updateAppPromoSettingsForConnection } from "@/services/ride-receipt-follow-up.service";
import { getRequestOrigin } from "@/lib/server/request-origin";

const schema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
  imageUrl: z.string().nullable().optional(),
  playStoreUrl: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  linkMessage: z.string().nullable().optional(),
  linkTitle: z.string().nullable().optional(),
  linkDescription: z.string().nullable().optional(),
  linkImageUrl: z.string().nullable().optional(),
  shortLinkSlug: z.string().max(200).nullable().optional(),
});

/** Tenant-facing: imagem + link da Play Store enviados 3-5 min depois do
 * recibo de corrida concluída (ver ride-receipt-follow-up.service.ts). */
export const updateAppPromoSettingsAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return updateAppPromoSettingsForConnection(ctx.tenantId, parsed.connectionId, {
      ...parsed,
      publicOrigin: await getRequestOrigin(),
    });
  }
);
