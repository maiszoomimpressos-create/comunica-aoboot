import type { Metadata } from "next";
import { listAllConnectionsForAdmin } from "@/repositories/channel-connection.repository";
import { getAiAttendantSettings } from "@/repositories/ai-attendant-settings.repository";
import { listAllBotVerticals } from "@/repositories/bot-vertical.repository";
import { listAiUsageTotalsByConnection } from "@/repositories/ai-usage.repository";
import { listBusinessIntegrationsForAdmin } from "@/repositories/business-integration.repository";
import { WhatsappConnectionManager } from "@/components/admin/whatsapp/whatsapp-connection-manager";
import { AiAttendantModelForm } from "@/components/admin/whatsapp/ai-attendant-model-form";
import { BotVerticalsManager } from "@/components/admin/whatsapp/bot-verticals-manager";
import { BusinessIntegrationsManager } from "@/components/admin/whatsapp/business-integrations-manager";

export const metadata: Metadata = { title: "WhatsApp · Admin" };

export default async function AdminWhatsappPage() {
  const [connections, aiAttendantSettings, botVerticals, aiUsageTotals, businessIntegrations] =
    await Promise.all([
      listAllConnectionsForAdmin(),
      getAiAttendantSettings(),
      listAllBotVerticals(),
      listAiUsageTotalsByConnection(),
      listBusinessIntegrationsForAdmin(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conexões WhatsApp</h1>
        <p className="text-muted-foreground">
          Solicitações de todas as empresas. Configure as credenciais da Z-API pra ativar cada uma.
        </p>
      </div>
      <WhatsappConnectionManager
        connections={connections}
        aiUsageTotals={Object.fromEntries(aiUsageTotals)}
      />
      <AiAttendantModelForm currentModel={aiAttendantSettings.model} />
      <BotVerticalsManager verticals={botVerticals} />
      <BusinessIntegrationsManager integrations={businessIntegrations} />
    </div>
  );
}
