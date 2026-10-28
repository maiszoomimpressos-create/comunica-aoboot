import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { listFlows } from "@/services/flow.service";
import { FlowsList } from "@/components/dashboard/whatsapp/fluxos/flows-list";

export const metadata: Metadata = { title: "Fluxos" };

export default async function FluxosConnectionPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
}) {
  const { tenantSlug, connectionId } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.flows.manage");

  const connection = await getConnectionSummary(ctx.tenantId, connectionId);
  if (!connection) notFound();

  const flows = await listFlows(connectionId);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/atendimento/${connectionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Atendimento
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fluxos</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} · {connection.phoneNumber}
        </p>
      </div>

      <FlowsList
        tenantSlug={tenantSlug}
        connectionId={connectionId}
        flows={flows.map((f) => ({ id: f.id, name: f.name, status: f.status, updatedAt: f.updatedAt.toISOString() }))}
      />
    </div>
  );
}
