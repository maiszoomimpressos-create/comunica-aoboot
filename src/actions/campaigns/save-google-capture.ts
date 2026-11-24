"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { saveGoogleCapture } from "@/services/google-capture.service";
import { MAX_RESULTS_PER_SEARCH } from "@/lib/google-places/places";

const schema = z.object({
  connectionId: z.string().min(1),
  listName: z.string().min(1, "Informe um nome para a lista.").max(120),
  query: z.string().max(200),
  items: z
    .array(z.object({ placeId: z.string().min(1).max(300), name: z.string().min(1).max(200), phone: z.string().max(20) }))
    .min(1, "Marque pelo menos um contato.")
    .max(MAX_RESULTS_PER_SEARCH),
});

/** Salva os contatos marcados como contatos frios numa lista montada. */
export const saveGoogleCaptureAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, ...rest } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return saveGoogleCapture(ctx.tenantId, connectionId, rest);
  }
);
