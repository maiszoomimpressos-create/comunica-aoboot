import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Workflow, ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Fluxos" };

/** Landing page for the sidebar's "Fluxos" link — mesmo padrão de picker de
 * .../campanhas e .../atendimento: fluxos são sempre escopados a uma
 * conexão (ver Flow.connectionId). */
export default async function FluxosLandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.flows.manage");

  const connections = await listConnectionsForTenant(ctx.tenantId, "WHATSAPP");
  const connected = connections.filter((c) => c.status === "CONNECTED");

  if (connected.length === 1) {
    redirect(`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connected[0].id}`);
  }

  if (connected.length === 0) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link
          href={`/app/${tenantSlug}/modulos/whatsapp`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          WhatsApp
        </Link>
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h1 className="text-lg font-medium">Conecte um WhatsApp primeiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Fluxos dependem de um número já conectado — conecte um em Módulos → WhatsApp.
          </p>
          <Button className="mt-4" nativeButton={false} render={<Link href={`/app/${tenantSlug}/modulos/whatsapp`} />}>
            Ir para WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fluxos</h1>
        <p className="text-muted-foreground">Escolha a conexão para ver ou criar fluxos.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {connected.map((connection) => (
          <Link key={connection.id} href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connection.id}`}>
            <Card className="flex items-center gap-3 p-4 hover:bg-muted/50">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Workflow className="size-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{connection.connectionName}</p>
                <p className="text-sm text-muted-foreground">{connection.phoneNumber}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
