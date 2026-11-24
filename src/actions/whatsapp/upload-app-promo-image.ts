"use server";

import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { ValidationError } from "@/lib/server/errors";
import { uploadAppPromoImage } from "@/services/ride-receipt-follow-up.service";

/** Recebe um FormData com `connectionId` e `file` (a imagem já reduzida no
 * navegador, abaixo do limite de 1 MB do corpo de Server Action) e devolve
 * a URL pública no Vercel Blob. */
export const uploadAppPromoImageAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, formData: FormData) => {
    const connectionId = formData.get("connectionId");
    const file = formData.get("file");
    if (typeof connectionId !== "string" || !connectionId) throw new ValidationError("Conexão não informada.");
    if (!(file instanceof File)) throw new ValidationError("Selecione uma imagem.");
    assertConnectionAccess(ctx, connectionId);
    return { url: await uploadAppPromoImage(ctx.tenantId, connectionId, file) };
  }
);
