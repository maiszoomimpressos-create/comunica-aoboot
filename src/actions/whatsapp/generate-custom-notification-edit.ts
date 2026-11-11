"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { previewCustomNotificationEditForConnection } from "@/services/custom-notification-ai-patch.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
  prompt: z.string().min(1),
});

/** Gera a prévia de uma edição por trecho (IA). Não salva nada. */
export const generateCustomNotificationEditAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return previewCustomNotificationEditForConnection(
      ctx.tenantId,
      parsed.connectionId,
      parsed.key,
      parsed.prompt
    );
  }
);
