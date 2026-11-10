"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { generateCustomNotificationTypeDraftForConnection } from "@/services/custom-notification-type.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});

/** Tenant-facing: gera (via IA) o rascunho de campos + texto de uma função
 * personalizada a partir de uma descrição livre — não salva nada ainda. */
export const generateCustomNotificationTypeDraftAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    return generateCustomNotificationTypeDraftForConnection(
      ctx.tenantId,
      parsed.connectionId,
      parsed.title,
      parsed.description
    );
  }
);
