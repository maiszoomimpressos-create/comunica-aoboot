import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Headset, ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Atendimento" };

/** Landing page for the sidebar's "Atendimento" link — same picker pattern
 * as .../campanhas/page.tsx: skips straight to the connection when there's
 * only one CONNECTED WhatsApp, shows a picker when there's more than one.
 * Atendimento (IA, setores, fluxos, base de conhecimento) is always scoped
 * to a connection, same reasoning as campaigns/setores. */
export default async function AtendimentoLandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connections = await listConnectionsForTenant(ctx.tenantId, "WHATSAPP");
  const connected = connections.filter((c) => c.status === "CONNECTED");

  if (connected.length === 1) {
    redirect(`/app/${tenantSlug}/modulos/whatsapp/atendimento/${connected[0].id}`);
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
            Atendimento (IA, setores, fluxos) depende de um número já conectado — conecte um em Módulos →
            WhatsApp.
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
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground">Escolha a conexão para configurar o atendimento.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {connected.map((connection) => (
          <Link key={connection.id} href={`/app/${tenantSlug}/modulos/whatsapp/atendimento/${connection.id}`}>
            <Card className="flex items-center gap-3 p-4 hover:bg-muted/50">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Headset className="size-4 text-primary" />
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
