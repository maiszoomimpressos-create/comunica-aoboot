import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { listSetores } from "@/services/setor.service";
import { SetoresManager } from "@/components/dashboard/whatsapp/setores-manager";

export const metadata: Metadata = { title: "Setores" };

export default async function SetoresConnectionPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
}) {
  const { tenantSlug, connectionId } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connection = await getConnectionSummary(ctx.tenantId, connectionId);
  if (!connection) notFound();

  const setores = await listSetores(connectionId);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        WhatsApp
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setores</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} ({connection.phoneNumber}) — quando a IA transfere um atendimento
          pra um humano, ela escolhe um destes setores e avisa todo o pool de atendentes.
        </p>
      </div>

      <SetoresManager tenantSlug={tenantSlug} connectionId={connectionId} setores={setores} />
    </div>
  );
}
