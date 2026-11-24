import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { SHORT_LINK_PUBLIC_ORIGIN } from "@/config/short-links";
import { listShortLinksForTenant } from "@/services/short-link.service";
import { ShortLinksManager } from "@/components/dashboard/links/short-links-manager";

export const metadata: Metadata = { title: "Links curtos" };

export default async function LinksCurtosPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const origin = SHORT_LINK_PUBLIC_ORIGIN;
  const links = await listShortLinksForTenant(ctx.tenantId, origin);

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Links curtos</h1>
        <p className="text-muted-foreground">
          Troque links compridos por um link curto da sua empresa para mandar nas mensagens. Quem clica vai direto
          para o destino, e o WhatsApp mostra a prévia com o título, a descrição e a imagem que você escolher.
        </p>
      </div>
      <ShortLinksManager
        tenantSlug={tenantSlug}
        origin={origin}
        canManage={ctx.permissions.includes("whatsapp.manage")}
        links={links}
      />
    </div>
  );
}
