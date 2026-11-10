"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateCustomNotificationTypeForConnection } from "@/services/custom-notification-type.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1, "Informe um título."),
  description: z.string(),
  fields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().optional(),
      valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
    })
  ),
  messageTemplate: z.string().min(1, "Informe o texto da mensagem."),
  requiresQr: z.boolean(),
  greetingStyle: z.enum(["FIXO", "HORARIO"]),
  greetingNameSource: z.enum(["PERFIL_WHATSAPP", "CADASTRO"]),
  aiDescription: z.string().optional(),
});

/** Tenant-facing: corrige uma função personalizada já salva (label,
 * descrição, campos, texto, QR) — `key` nunca muda, ver
 * updateCustomNotificationTypeForConnection em custom-notification-type.service.ts. */
export const updateCustomNotificationTypeAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    await updateCustomNotificationTypeForConnection(ctx.tenantId, parsed);
    return { ok: true };
  }
);
