import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import { toErrorPayload } from "@/lib/server/errors";
import { CAMPAIGN_MEDIA_LIMITS, type CampaignMediaKind } from "@/config/campaign-media";

/**
 * Upload de mídia de campanha direto do navegador pro Vercel Blob (client
 * upload) — o arquivo NÃO passa pelo servidor, então não esbarra no limite
 * de ~1 MB de Server Action / 4,5 MB de corpo de função. Este endpoint só
 * (1) confere sessão, permissão e acesso à conexão e (2) emite o token de
 * upload com tipo e tamanho máximos por tipo de mídia.
 *
 * Mesmo padrão de armazenamento da imagem pós-corrida (Vercel Blob,
 * público, BLOB_READ_WRITE_TOKEN), só que via token de cliente.
 */
const payloadSchema = z.object({
  tenantSlug: z.string().min(1),
  connectionId: z.string().min(1),
  kind: z.enum(["image", "video", "document", "audio"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = payloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        const ctx = await getRequestContext(payload.tenantSlug);
        requirePermission(ctx, "campaigns.manage");
        assertConnectionAccess(ctx, payload.connectionId);

        const limits = CAMPAIGN_MEDIA_LIMITS[payload.kind as CampaignMediaKind];
        if (!pathname.startsWith(`campaign-media/${payload.tenantSlug}/`)) {
          throw new Error("Caminho de upload inválido.");
        }
        return {
          allowedContentTypes: limits.contentTypes,
          maximumSizeInBytes: limits.maxBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ tenantId: ctx.tenantId, connectionId: payload.connectionId }),
        };
      },
      // Sem onUploadCompleted: nada a registrar (a URL só passa a valer
      // quando a campanha é criada com ela) e assim não depende do callback
      // da Vercel chegar no localhost. Arquivos de campanhas não criadas
      // ficam órfãos no Blob — limpeza manual se um dia pesar.
    });
    return NextResponse.json(json);
  } catch (err) {
    unstable_rethrow(err);
    const payload = toErrorPayload(err);
    return NextResponse.json({ error: payload.message || "Falha ao autorizar o upload." }, { status: 400 });
  }
}
