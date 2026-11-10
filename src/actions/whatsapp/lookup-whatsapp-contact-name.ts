"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { lookupWhatsappContactName } from "@/services/custom-notification-preview-test.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  to: z.string().min(1, "Informe o número de destino."),
});

/** Consulta o nome do perfil WhatsApp do número informado nesta conexão.
 * Autenticado pela sessão (`whatsapp.manage`). Não envia mensagem. */
export const lookupWhatsappContactNameAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return lookupWhatsappContactName(ctx.tenantId, parsed.connectionId, parsed.to);
  }
);
