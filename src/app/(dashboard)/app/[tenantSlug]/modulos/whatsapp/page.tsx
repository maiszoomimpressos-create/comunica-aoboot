import type { Metadata } from "next";
import Link from "next/link";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { WhatsappWelcome } from "@/components/dashboard/whatsapp/whatsapp-welcome";
import { ConnectionCard } from "@/components/dashboard/whatsapp/connection-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsappModulePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connections = await listConnectionsForTenant(ctx.tenantId, "WHATSAPP");
  const canManage = ctx.permissions.includes("whatsapp.manage");

  if (connections.length === 0) {
    return <WhatsappWelcome tenantSlug={tenantSlug} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">Conexões ativas para envio de mensagens.</p>
        </div>
        {canManage && (
          <Button
            nativeButton={false}
            render={<Link href={`/app/${tenantSlug}/modulos/whatsapp/conectar`} />}
          >
            Nova conexão
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            tenantSlug={tenantSlug}
            connection={connection}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}
