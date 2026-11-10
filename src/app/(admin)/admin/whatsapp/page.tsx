import type { Metadata } from "next";
import { listAllConnectionsForAdmin } from "@/repositories/channel-connection.repository";
import { getAiAttendantSettings } from "@/repositories/ai-attendant-settings.repository";
import { listAllBotVerticals } from "@/repositories/bot-vertical.repository";
import { listAiUsageTotalsByConnection } from "@/repositories/ai-usage.repository";
import { listBusinessIntegrationsForAdmin } from "@/repositories/business-integration.repository";
import { listAllFunctionTemplates } from "@/repositories/function-template.repository";
import { listAllNotificationFieldBlocks } from "@/repositories/notification-field-block.repository";
import { WhatsappConnectionManager } from "@/components/admin/whatsapp/whatsapp-connection-manager";
import { AiAttendantModelForm } from "@/components/admin/whatsapp/ai-attendant-model-form";
import { BotVerticalsManager } from "@/components/admin/whatsapp/bot-verticals-manager";
import { BusinessIntegrationsManager } from "@/components/admin/whatsapp/business-integrations-manager";
import { FunctionTemplatesManager } from "@/components/admin/whatsapp/function-templates-manager";
import { NotificationFieldBlocksManager } from "@/components/admin/whatsapp/notification-field-blocks-manager";

export const metadata: Metadata = { title: "WhatsApp · Admin" };

export default async function AdminWhatsappPage() {
  const [
    connections,
    aiAttendantSettings,
    botVerticals,
    aiUsageTotals,
    businessIntegrations,
    functionTemplates,
    fieldBlocks,
  ] = await Promise.all([
    listAllConnectionsForAdmin(),
    getAiAttendantSettings(),
    listAllBotVerticals(),
    listAiUsageTotalsByConnection(),
    listBusinessIntegrationsForAdmin(),
    listAllFunctionTemplates(),
    listAllNotificationFieldBlocks(),
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
      <FunctionTemplatesManager templates={functionTemplates} />
      <NotificationFieldBlocksManager blocks={fieldBlocks} />
      <BusinessIntegrationsManager integrations={businessIntegrations} />
    </div>
  );
}
