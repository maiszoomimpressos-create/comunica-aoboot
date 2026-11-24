"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getListConnectionId, getListNamePreview } from "@/services/whatsapp-contacts.service";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";

const schema = z.object({ listId: z.string().min(1) });

/** Prévia na tela de criar campanha: de onde vêm os nomes da lista. */
export const getListNamePreviewAction = defineTenantAction(
  "campaigns.view",
  async (ctx, input: z.infer<typeof schema>) => {
    const { listId } = schema.parse(input);
    const connectionId = await getListConnectionId(ctx.tenantId, listId);
    if (connectionId) assertConnectionAccess(ctx, connectionId);
    return getListNamePreview(ctx.tenantId, listId);
  }
);
