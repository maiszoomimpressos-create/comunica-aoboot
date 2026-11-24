"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getRequestOrigin } from "@/lib/server/request-origin";
import { deleteShortLinkForTenant, saveShortLinkForTenant, toShortLinkView } from "@/services/short-link.service";

const schema = z.object({
  id: z.string().optional(),
  slug: z.string().max(200).nullable().optional(),
  targetUrl: z.string().min(1).max(2000),
  title: z.string().max(500).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
});

/** Tenant-facing: cria ou edita um link curto (menu Links curtos). */
export const saveShortLinkAction = defineTenantAction("whatsapp.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  const saved = await saveShortLinkForTenant(ctx.tenantId, parsed);
  return toShortLinkView((await getRequestOrigin()) ?? "", saved);
});

export const deleteShortLinkAction = defineTenantAction("whatsapp.manage", async (ctx, input: { id: string }) => {
  const parsed = z.object({ id: z.string().min(1) }).parse(input);
  return deleteShortLinkForTenant(ctx.tenantId, parsed.id);
});
