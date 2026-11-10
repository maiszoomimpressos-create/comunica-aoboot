"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createCustomNotificationTypeForConnection } from "@/services/custom-notification-type.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
      valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
});

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(fieldSchema).min(1),
  messageTemplate: z.string().min(1),
  requiresQr: z.boolean(),
  greetingStyle: z.enum(["FIXO", "HORARIO"]),
  greetingNameSource: z.enum(["PERFIL_WHATSAPP", "CADASTRO"]),
  aiDescription: z.string().optional(),
});

/** Tenant-facing: salva uma função personalizada depois do tenant revisar o
 * rascunho gerado pela IA (ver generate-custom-notification-type-draft.ts). */
export const createCustomNotificationTypeAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return createCustomNotificationTypeForConnection(ctx.tenantId, parsed);
  }
);
