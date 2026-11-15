"use server";

import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { ValidationError } from "@/lib/server/errors";
import { uploadMessageImage } from "@/services/message-image-upload.service";

/** Tenant-facing: sobe a imagem de um bloco Imagem ou do banner de uma
 * publicidade e devolve a URL pública. */
export const uploadMessageImageAction = defineTenantAction("whatsapp.manage", async (ctx, formData: FormData) => {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ValidationError("Escolha uma imagem.");
  return uploadMessageImage(ctx.tenantId, file);
});
