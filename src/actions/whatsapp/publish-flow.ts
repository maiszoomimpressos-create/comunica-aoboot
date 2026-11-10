"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getFlow, publishFlow } from "@/services/flow.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ flowId: z.string().min(1) });

export const publishFlowAction = defineTenantAction("whatsapp.flows.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  const flow = await getFlow(ctx.tenantId, parsed.flowId);
  assertConnectionAccess(ctx, flow.connectionId);
  return publishFlow(ctx.tenantId, parsed.flowId);
});
