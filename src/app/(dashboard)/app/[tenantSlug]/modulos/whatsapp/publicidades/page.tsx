import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { filterAccessibleConnections } from "@/lib/rbac/connection-scope";
import { listCustomNotificationTypes } from "@/repositories/custom-notification-type.repository";
import { NOTIFICATION_TYPES } from "@/config/whatsapp-notification-types";
import { loadAdvertisementsPage } from "@/services/advertisement.service";
import {
  AdvertisementsManager,
  type AdvertisementConnectionOption,
} from "@/components/dashboard/whatsapp/publicidades/advertisements-manager";

export const metadata: Metadata = { title: "Publicidades" };

export default async function PublicidadesPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connections = filterAccessibleConnections(await listConnectionsForTenant(ctx.tenantId, "WHATSAPP"), ctx);
  const customTypesByConnection = await Promise.all(connections.map((c) => listCustomNotificationTypes(c.id)));
  const options: AdvertisementConnectionOption[] = connections.map((connection, i) => ({
    id: connection.id,
    name: connection.connectionName,
    phoneNumber: connection.phoneNumber,
    connected: connection.status === "CONNECTED",
    functions: [
      ...customTypesByConnection[i].map((t) => ({ key: t.key, label: t.label })),
      ...NOTIFICATION_TYPES.filter((t) => connection.enabledNotificationTypes.includes(t.key)).map((t) => ({
        key: t.key,
        label: t.label,
      })),
    ],
  }));
  const data = await loadAdvertisementsPage(
    ctx.tenantId,
    connections.map((c) => c.id)
  );

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Publicidades</h1>
        <p className="text-muted-foreground">
          Cadastre um banner com mensagem que chega alguns segundos depois de uma função (por exemplo, o recibo da
          corrida). Vai só para quem acabou de receber a função, uma de cada vez — nunca em massa.
        </p>
      </div>
      <AdvertisementsManager
        tenantSlug={tenantSlug}
        ready={data.ready}
        canManage={ctx.permissions.includes("whatsapp.manage")}
        connections={options}
        advertisements={data.advertisements}
      />
    </div>
  );
}
