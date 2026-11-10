import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { filterAccessibleConnections } from "@/lib/rbac/connection-scope";
import { NovoSegmentoForm } from "@/components/dashboard/whatsapp/segmentos/novo-segmento-form";

export const metadata: Metadata = { title: "Novo segmento" };

export default async function NovoSegmentoPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.manage");

  const allConnections = await listConnectionsForTenant(ctx.tenantId, "WHATSAPP");
  const connections = filterAccessibleConnections(allConnections, ctx);

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/segmentos`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Segmentos
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo segmento</h1>
        <p className="text-muted-foreground">
          Escolha o nicho, dê um nome e diga se esse segmento vai usar uma conexão de WhatsApp nova ou
          uma que você já tem.
        </p>
      </div>

      <NovoSegmentoForm
        tenantSlug={tenantSlug}
        connections={connections.map((c) => ({
          id: c.id,
          connectionName: c.connectionName,
          phoneNumber: c.phoneNumber,
        }))}
      />
    </div>
  );
}
