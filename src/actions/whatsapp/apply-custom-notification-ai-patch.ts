"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { applyCustomNotificationAiPatchForConnection } from "@/services/custom-notification-ai-patch.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
});

const additionSchema = z.object({
  newFields: z.array(fieldSchema).default([]),
  newLines: z.array(z.string()).default([]),
  insertAfterFieldKey: z.string().nullable().optional(),
  insertAfterLine: z.string().nullable().optional(),
});

const editPatchSchema = z.object({
  fieldUpdates: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().optional(),
        description: z.string().nullable().optional(),
        required: z.boolean().optional(),
        valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
      })
    )
    .optional(),
  newFields: z.array(fieldSchema).optional(),
  lineReplacements: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  lineInsertions: z
    .array(
      z.object({
        afterFieldKey: z.string().nullable().optional(),
        afterLine: z.string().nullable().optional(),
        lines: z.array(z.string()).min(1),
      })
    )
    .optional(),
  lineDeletions: z.array(z.string()).optional(),
});

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
  prompt: z.string().min(1),
  mode: z.enum(["adicionar", "editar"]),
  addition: additionSchema.optional(),
  editPatch: editPatchSchema.optional(),
});

/** Aplica o acréscimo ou a edição por trecho já revisados. O merge e a
 * validação byte a byte rodam de novo no servidor, a partir do registro atual. */
export const applyCustomNotificationAiPatchAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return applyCustomNotificationAiPatchForConnection(ctx.tenantId, parsed);
  }
);
