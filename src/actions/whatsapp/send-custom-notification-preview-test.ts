"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { sendCustomNotificationPreviewTest } from "@/services/custom-notification-preview-test.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const fieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
});

const schema = z.object({
  connectionId: z.string().min(1),
  to: z.string().min(1, "Informe o número de destino."),
  messageTemplate: z.string(),
  fields: z.array(fieldSchema),
  greetingStyle: z.enum(["FIXO", "HORARIO"]),
  greetingNameSource: z.enum(["PERFIL_WHATSAPP", "CADASTRO"]),
  details: z.record(z.string(), z.string()).optional(),
});

/** Envia a prévia da função personalizada (template atual + dados de exemplo)
 * por esta conexão, com prefixo [TESTE]. Autenticado pela sessão; exige
 * `whatsapp.manage`. Não usa a chave de API em texto puro. */
export const sendCustomNotificationPreviewTestAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return sendCustomNotificationPreviewTest(ctx.tenantId, parsed);
  }
);
