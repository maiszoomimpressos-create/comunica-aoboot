"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createFlow } from "@/services/flow.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  name: z.string().min(1),
});

export const createFlowAction = defineTenantAction("whatsapp.flows.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  assertConnectionAccess(ctx, parsed.connectionId);
  return createFlow(ctx.tenantId, parsed.connectionId, parsed.name);
});
