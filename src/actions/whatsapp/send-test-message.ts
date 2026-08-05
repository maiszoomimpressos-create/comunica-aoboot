"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { sendTestMessage } from "@/services/whatsapp-connection.service";

const schema = z.object({
  connectionId: z.string().min(1),
  to: z.string().min(1, "Informe o número de destino."),
  message: z.string().min(1, "Informe a mensagem."),
});

export const sendTestMessageAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return sendTestMessage(ctx.tenantId, parsed.connectionId, parsed.to, parsed.message);
  }
);
