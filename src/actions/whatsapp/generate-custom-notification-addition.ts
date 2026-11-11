"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { previewCustomNotificationAdditionForConnection } from "@/services/custom-notification-ai-patch.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  key: z.string().min(1),
  prompt: z.string().min(1),
});

/** Gera a prévia de um acréscimo (IA). Não salva nada. */
export const generateCustomNotificationAdditionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return previewCustomNotificationAdditionForConnection(
      ctx.tenantId,
      parsed.connectionId,
      parsed.key,
      parsed.prompt
    );
  }
);
