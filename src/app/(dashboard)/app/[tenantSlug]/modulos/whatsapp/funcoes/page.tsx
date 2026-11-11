import type { Metadata } from "next";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { listConnectionsForTenant } from "@/repositories/channel-connection.repository";
import { filterAccessibleConnections } from "@/lib/rbac/connection-scope";
import {
  listCustomNotificationTypes,
  type CustomNotificationField,
} from "@/repositories/custom-notification-type.repository";
import { listSegmentosForTenant } from "@/repositories/segmento.repository";
import { listActiveNotificationFieldBlocks } from "@/repositories/notification-field-block.repository";
import { NotificationTypesPanel } from "@/components/dashboard/whatsapp/notification-types-panel";

export const metadata: Metadata = { title: "Funções" };

export default async function FuncoesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connections = filterAccessibleConnections(
    await listConnectionsForTenant(ctx.tenantId, "WHATSAPP"),
    ctx
  ).filter((c) => c.status === "CONNECTED");

  const [customTypesByConnection, segmentos, fieldBlocks] = await Promise.all([
    Promise.all(connections.map((c) => listCustomNotificationTypes(c.id))),
    listSegmentosForTenant(ctx.tenantId),
    listActiveNotificationFieldBlocks(),
  ]);
  const nichesByConnection = new Map<string, string[]>();
  for (const segmento of segmentos) {
    const niches = nichesByConnection.get(segmento.connectionId) ?? [];
    niches.push(segmento.niche);
    nichesByConnection.set(segmento.connectionId, niches);
  }

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funções</h1>
        <p className="text-muted-foreground">
          Escolha, por conexão, quais tipos de mensagem o sistema pode mandar automaticamente — a API só
          consegue disparar os tipos marcados aqui.
        </p>
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conexão de WhatsApp ativa ainda — conecte um número em "Conectar" pra configurar as
          funções dele.
        </p>
      ) : (
        <div className="space-y-6">
          {connections.map((connection, i) => (
            <NotificationTypesPanel
              key={connection.id}
              tenantSlug={tenantSlug}
              connectionId={connection.id}
              connectionName={connection.connectionName}
              phoneNumber={connection.phoneNumber}
              defaultTypes={connection.enabledNotificationTypes}
              niches={nichesByConnection.get(connection.id) ?? []}
              fieldBlocks={fieldBlocks}
              customTypes={customTypesByConnection[i].map((c) => ({
                id: c.id,
                key: c.key,
                label: c.label,
                description: c.description,
                fields: c.fields as unknown as CustomNotificationField[],
                messageTemplate: c.messageTemplate,
                requiresQr: c.requiresQr,
                greetingStyle: c.greetingStyle,
                greetingNameSource: c.greetingNameSource,
                aiDescription: c.aiDescription,
                history: c.history,
                createdAt: c.createdAt.toISOString(),
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
