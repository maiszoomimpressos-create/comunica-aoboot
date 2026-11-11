import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { hasPermission, requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { assertConnectionAccessOrNotFound } from "@/lib/rbac/connection-scope";
import { getBotConfig } from "@/repositories/bot.repository";
import { listActiveBotVerticals } from "@/repositories/bot-vertical.repository";
import { Card } from "@/components/ui/card";
import { BotAttendantSection } from "@/components/dashboard/whatsapp/bot-attendant-section";
import { listPausedAutomaticReplies } from "@/services/anti-loop.service";
import { PausedContactsPanel } from "@/components/dashboard/whatsapp/paused-contacts-panel";

export const metadata: Metadata = { title: "Atendente de IA" };

export default async function AtendenteIaConnectionPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
}) {
  const { tenantSlug, connectionId } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.view");

  const connection = await getConnectionSummary(ctx.tenantId, connectionId);
  if (!connection) notFound();
  assertConnectionAccessOrNotFound(ctx, connectionId);

  const canManageBot = hasPermission(ctx, "whatsapp.bot.manage");
  const [botConfig, verticals, pausedContacts] = await Promise.all([
    getBotConfig(connectionId),
    listActiveBotVerticals(),
    listPausedAutomaticReplies(connectionId),
  ]);

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
        <h1 className="text-2xl font-semibold tracking-tight">Atendente de IA</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} · {connection.phoneNumber} — escolha o tipo de serviço (nicho do
          negócio) e configure como a IA responde por este número.
        </p>
      </div>

      <Card className="p-6">
        <BotAttendantSection
          tenantSlug={tenantSlug}
          connectionId={connectionId}
          defaultEnabled={botConfig?.enabled ?? false}
          defaultBusinessProfile={botConfig?.businessProfile ?? null}
          defaultVerticalId={botConfig?.verticalId ?? null}
          verticals={verticals}
        />
      </Card>

      <Card className="p-6">
        <PausedContactsPanel
          tenantSlug={tenantSlug}
          connectionId={connectionId}
          canManage={canManageBot}
          items={pausedContacts}
        />
      </Card>
    </div>
  );
}
