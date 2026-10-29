"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateFlowGraph } from "@/services/flow.service";

const optionSchema = z.object({ id: z.string().min(1), label: z.string() });

const formFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  variable: z.string(),
  fieldType: z.enum(["text", "phone", "cpf", "date", "email", "number"]),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["start", "message", "menu", "question", "condition", "form", "end", "ai", "action", "human"]),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z
    .object({
      text: z.string().optional(),
      options: z.array(optionSchema).optional(),
      variable: z.string().optional(),
      operator: z.enum(["equals", "contains"]).optional(),
      value: z.string().optional(),
      title: z.string().optional(),
      fields: z.array(formFieldSchema).optional(),
    })
    .passthrough()
    .optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  target: z.string().min(1),
  targetHandle: z.string().nullable().optional(),
});

const schema = z.object({
  flowId: z.string().min(1),
  name: z.string().optional(),
  graph: z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) }),
});

export const updateFlowAction = defineTenantAction("whatsapp.flows.manage", async (ctx, input: z.infer<typeof schema>) => {
  const parsed = schema.parse(input);
  return updateFlowGraph(ctx.tenantId, parsed.flowId, parsed.graph, parsed.name);
});
