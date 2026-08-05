"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteConnection } from "@/repositories/channel-connection.repository";
import { NotFoundError } from "@/lib/server/errors";

const schema = z.object({ connectionId: z.string().min(1) });

export const deleteWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const result = await deleteConnection(ctx.tenantId, parsed.connectionId);
    if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");
    return { ok: true };
  }
);
