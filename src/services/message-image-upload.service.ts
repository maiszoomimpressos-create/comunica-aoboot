import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { ValidationError } from "@/lib/server/errors";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

/** Imagens aceitas no WhatsApp sem conversão. A tela já reduz a imagem no
 * navegador (JPEG até 1600px) antes de enviar, para caber no limite de
 * 1 MB das Server Actions. */
export const MESSAGE_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const MAX_MESSAGE_IMAGE_BYTES = 950 * 1024;

/**
 * Guarda a imagem de um bloco/publicidade no Vercel Blob (mesmo storage que
 * já guarda os PDFs dos formulários, ver form-submission.service.ts) e
 * devolve a URL pública que a Z-API vai baixar no envio.
 */
export async function uploadMessageImage(tenantId: string, file: File): Promise<{ url: string }> {
  const ext = MESSAGE_IMAGE_TYPES[file.type];
  if (!ext) throw new ValidationError("Envie uma imagem JPG ou PNG.");
  if (file.size === 0) throw new ValidationError("O arquivo está vazio.");
  if (file.size > MAX_MESSAGE_IMAGE_BYTES) {
    throw new ValidationError("Imagem grande demais. Use uma imagem de até 950 KB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const blob = await put(`mensagens/${tenantId}/${randomUUID()}.${ext}`, buffer, {
      access: "public",
      contentType: file.type,
    });
    return { url: blob.url };
  } catch (err) {
    await logBotEvent("error", "message_image_upload_failed", { tenantId, error: serializeError(err) });
    throw new ValidationError("Não foi possível guardar a imagem agora. Tente de novo ou cole um link.");
  }
}
