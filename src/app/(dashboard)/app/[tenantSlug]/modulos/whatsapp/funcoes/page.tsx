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
import { AppPromoSettingsCard } from "@/components/dashboard/whatsapp/app-promo-settings-card";
import { listAppPromoSettings, getTenantMessageNames } from "@/repositories/app-promo-settings.repository";
import { isRideReceiptNotificationType } from "@/config/ride-receipt-app-promo";

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

  const [customTypesByConnection, segmentos, fieldBlocks, appPromoSettings, tenantNames] = await Promise.all([
    Promise.all(connections.map((c) => listCustomNotificationTypes(c.id))),
    listSegmentosForTenant(ctx.tenantId),
    listActiveNotificationFieldBlocks(),
    listAppPromoSettings(connections.map((c) => c.id)),
    getTenantMessageNames(ctx.tenantId),
  ]);
  const appPromoByConnection = new Map(appPromoSettings.map((s) => [s.connectionId, s]));
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
          {connections.map((connection, i) => {
            const appPromo = appPromoByConnection.get(connection.id) ?? null;
            // Recibo de corrida: o tipo fixo corrida_concluida ou a função
            // personalizada corrida_mai_drive (ver ride-receipt-app-promo.ts).
            const receiptTypeEnabled = connection.enabledNotificationTypes.some(isRideReceiptNotificationType);
            // Card da imagem pós-corrida só aparece pra quem é de corrida
            // (função marcada, nicho de mobilidade, ou já configurou antes).
            const showAppPromo =
              receiptTypeEnabled ||
              appPromo !== null ||
              (nichesByConnection.get(connection.id) ?? []).includes("MOBILIDADE_CORRIDAS");
            return (
              <div key={connection.id} className="space-y-6">
                <NotificationTypesPanel
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
                {showAppPromo && (
                  <AppPromoSettingsCard
                    tenantSlug={tenantSlug}
                    connectionId={connection.id}
                    businessName={
                      connection.businessName || tenantNames?.messageBusinessName || tenantNames?.name || "sua empresa"
                    }
                    receiptTypeEnabled={receiptTypeEnabled}
                    initial={
                      appPromo
                        ? {
                            enabled: appPromo.enabled,
                            imageUrl: appPromo.imageUrl,
                            playStoreUrl: appPromo.playStoreUrl,
                            caption: appPromo.caption,
                            linkMessage: appPromo.linkMessage,
                            linkTitle: appPromo.linkTitle,
                            linkDescription: appPromo.linkDescription,
                            linkImageUrl: appPromo.linkImageUrl,
                          }
                        : null
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
