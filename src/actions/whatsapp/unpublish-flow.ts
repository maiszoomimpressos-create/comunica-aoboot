"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { unpublishFlow } from "@/services/flow.service";

const schema = z.object({ flowId: z.string().min(1) });

export const unpublishFlowAction = defineTenantAction("whatsapp.flows.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  return unpublishFlow(ctx.tenantId, parsed.flowId);
});
