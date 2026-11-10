import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Tags } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listSegmentosForTenant } from "@/repositories/segmento.repository";
import { getSegmentoNicheLabel } from "@/config/segmento-niches";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteSegmentoButton } from "@/components/dashboard/whatsapp/segmentos/delete-segmento-button";

export const metadata: Metadata = { title: "Segmentos" };

export default async function SegmentosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const segmentos = await listSegmentosForTenant(ctx.tenantId);
  const canManage = ctx.permissions.includes("whatsapp.manage");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segmentos</h1>
          <p className="text-muted-foreground">
            Nichos de negócio da sua empresa — cada um aponta pra uma conexão de WhatsApp, nova ou já
            existente. Várias conexões podem servir o mesmo segmento; um segmento sempre pertence a uma
            conexão só.
          </p>
        </div>
        {canManage && (
          <Button
            nativeButton={false}
            render={<Link href={`/app/${tenantSlug}/modulos/whatsapp/segmentos/novo`} />}
          >
            <Plus className="size-4" />
            Novo segmento
          </Button>
        )}
      </div>

      {segmentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum segmento cadastrado ainda. {canManage && "Crie o primeiro pra organizar suas conexões por nicho de negócio."}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {segmentos.map((segmento) => (
            <div key={segmento.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Tags className="size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {segmento.name}
                    <Badge variant="secondary" className="ml-2 align-middle">
                      {getSegmentoNicheLabel(segmento.niche)}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {segmento.connectionName} · {segmento.phoneNumber}
                  </p>
                </div>
              </div>
              {canManage && (
                <DeleteSegmentoButton
                  tenantSlug={tenantSlug}
                  segmentoId={segmento.id}
                  segmentoName={segmento.name}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
