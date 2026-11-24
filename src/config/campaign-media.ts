/** Tipos de mídia aceitos em campanhas e limites do upload (Vercel Blob,
 * client upload — ver app/api/campaigns/media-upload/route.ts). Limites
 * alinhados ao que o WhatsApp aceita: imagem 5 MB, vídeo/áudio 16 MB,
 * documento 100 MB. Arquivo puro de config — importável no navegador. */
export type CampaignMediaKind = "image" | "video" | "document" | "audio";

export const CAMPAIGN_MEDIA_LIMITS: Record<
  CampaignMediaKind,
  { label: string; maxBytes: number; contentTypes: string[]; accept: string }
> = {
  image: {
    label: "Imagem",
    maxBytes: 5 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    accept: "image/jpeg,image/png,image/webp",
  },
  video: {
    label: "Vídeo",
    maxBytes: 16 * 1024 * 1024,
    contentTypes: ["video/mp4", "video/3gpp"],
    accept: "video/mp4,video/3gpp",
  },
  audio: {
    label: "Áudio",
    maxBytes: 16 * 1024 * 1024,
    contentTypes: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm"],
    accept: "audio/*",
  },
  document: {
    label: "Documento",
    maxBytes: 100 * 1024 * 1024,
    contentTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "application/zip",
    ],
    accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip",
  },
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
