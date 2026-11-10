"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { suggestCustomNotificationTypeKeyForConnection } from "@/services/custom-notification-type.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({
  connectionId: z.string().min(1),
  title: z.string().min(1),
});

/** Tenant-facing: sugere um identificador técnico único pro fluxo "montar
 * com peças prontas" (ver create-custom-notification-type-form.tsx) — sem
 * IA, só pra não colidir com outra função já existente nessa conexão. */
export const suggestCustomNotificationTypeKeyAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    const suggestedKey = await suggestCustomNotificationTypeKeyForConnection(
      ctx.tenantId,
      parsed.connectionId,
      parsed.title
    );
    return { suggestedKey };
  }
);
