import type { Metadata } from "next";
import { listAllConnectionsForAdmin } from "@/repositories/channel-connection.repository";
import { WhatsappConnectionManager } from "@/components/admin/whatsapp/whatsapp-connection-manager";

export const metadata: Metadata = { title: "WhatsApp · Admin" };

export default async function AdminWhatsappPage() {
  const connections = await listAllConnectionsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conexões WhatsApp</h1>
        <p className="text-muted-foreground">
          Solicitações de todas as empresas. Configure as credenciais da Z-API pra ativar cada uma.
        </p>
      </div>
      <WhatsappConnectionManager connections={connections} />
    </div>
  );
}
