import type { Metadata } from "next";
import { listAllConnectionsForAdmin } from "@/repositories/channel-connection.repository";
import { getAiAttendantSettings } from "@/repositories/ai-attendant-settings.repository";
import { WhatsappConnectionManager } from "@/components/admin/whatsapp/whatsapp-connection-manager";
import { AiAttendantModelForm } from "@/components/admin/whatsapp/ai-attendant-model-form";

export const metadata: Metadata = { title: "WhatsApp · Admin" };

export default async function AdminWhatsappPage() {
  const [connections, aiAttendantSettings] = await Promise.all([
    listAllConnectionsForAdmin(),
    getAiAttendantSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conexões WhatsApp</h1>
        <p className="text-muted-foreground">
          Solicitações de todas as empresas. Configure as credenciais da Z-API pra ativar cada uma.
        </p>
      </div>
      <WhatsappConnectionManager connections={connections} />
      <AiAttendantModelForm currentModel={aiAttendantSettings.model} />
    </div>
  );
}
