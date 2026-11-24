"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { searchGoogleCapture } from "@/services/google-capture.service";
import { MAX_RESULTS_PER_SEARCH } from "@/lib/google-places/places";

const schema = z.object({
  connectionId: z.string().min(1),
  category: z.string().min(1, "Informe a categoria.").max(80),
  city: z.string().min(1, "Informe a cidade.").max(80),
  uf: z.string().length(2, "Informe a UF."),
  limit: z.number().int().min(1).max(MAX_RESULTS_PER_SEARCH),
});

/** Busca na Google Places API (New) e devolve a prévia (nada é gravado). */
export const searchGooglePlacesAction = defineTenantAction(
  "campaigns.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const { connectionId, ...search } = schema.parse(input);
    assertConnectionAccess(ctx, connectionId);
    return searchGoogleCapture(ctx.tenantId, connectionId, search);
  }
);
