"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteFlow } from "@/services/flow.service";

const schema = z.object({ flowId: z.string().min(1) });

export const deleteFlowAction = defineTenantAction("whatsapp.flows.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  await deleteFlow(ctx.tenantId, parsed.flowId);
  return { ok: true };
});
