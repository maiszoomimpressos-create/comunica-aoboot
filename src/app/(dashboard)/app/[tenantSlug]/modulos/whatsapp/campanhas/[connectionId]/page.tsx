import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import {
  getConnectionForCampaigns,
  getContactsOverview,
  getListsForConnection,
} from "@/services/whatsapp-contacts.service";
import { listCampaignsForConnection, getConnectionCampaignSettings } from "@/services/campaign.service";
import { SyncContactsButton } from "@/components/dashboard/whatsapp/campaigns/sync-contacts-button";
import { ContactsTable } from "@/components/dashboard/whatsapp/campaigns/contacts-table";
import { CreateListDialog } from "@/components/dashboard/whatsapp/campaigns/create-list-dialog";
import { ContactListCard } from "@/components/dashboard/whatsapp/campaigns/contact-list-card";
import { CollapsibleSection } from "@/components/dashboard/whatsapp/campaigns/collapsible-section";
import { CreateCampaignDialog } from "@/components/dashboard/whatsapp/campaigns/create-campaign-dialog";
import { CampaignCard } from "@/components/dashboard/whatsapp/campaigns/campaign-card";
import { CampaignSettingsDialog } from "@/components/dashboard/whatsapp/campaigns/campaign-settings-dialog";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampaignsConnectionPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
}) {
  const { tenantSlug, connectionId } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "campaigns.view");
  const canManage = ctx.permissions.includes("campaigns.manage");

  const connection = await getConnectionForCampaigns(ctx.tenantId, connectionId);
  if (!connection) notFound();

  const backLink = (
    <Link
      href={`/app/${tenantSlug}/modulos/whatsapp`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      WhatsApp
    </Link>
  );

  if (connection.status !== "CONNECTED") {
    return (
      <div className="max-w-2xl space-y-6">
        {backLink}
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h1 className="text-lg font-medium">Conecte o WhatsApp primeiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {connection.connectionName} ainda não está com a sessão pareada (escaneie o QR code em
            Módulos → WhatsApp) — sincronizar contatos e disparar campanhas só funciona depois disso.
          </p>
        </div>
      </div>
    );
  }

  const [{ contacts, activeCount }, lists, campaigns, campaignSettings] = await Promise.all([
    getContactsOverview(ctx.tenantId, connectionId),
    getListsForConnection(ctx.tenantId, connectionId),
    listCampaignsForConnection(ctx.tenantId, connectionId),
    getConnectionCampaignSettings(ctx.tenantId, connectionId),
  ]);

  return (
    <div className="max-w-4xl space-y-8">
      {backLink}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} ({connection.phoneNumber})
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Contatos</h2>
            <p className="text-sm text-muted-foreground">
              {activeCount} contato(s) ativo(s) de {contacts.length} sincronizado(s).
            </p>
          </div>
          {canManage && <SyncContactsButton tenantSlug={tenantSlug} connectionId={connectionId} />}
        </div>
        <ContactsTable tenantSlug={tenantSlug} contacts={contacts} canManage={canManage} />
      </section>

      <CollapsibleSection
        title="Listas"
        subtitle={`${lists.length} lista(s)`}
        actions={canManage && <CreateListDialog tenantSlug={tenantSlug} connectionId={connectionId} />}
      >
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma lista criada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <ContactListCard
                key={list.id}
                tenantSlug={tenantSlug}
                list={list}
                connectionPhoneNumber={connection.phoneNumber}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Campanhas</h2>
          {canManage && (
            <div className="flex gap-2">
              <CampaignSettingsDialog tenantSlug={tenantSlug} connectionId={connectionId} settings={campaignSettings} />
              <CreateCampaignDialog tenantSlug={tenantSlug} connectionId={connectionId} lists={lists} />
            </div>
          )}
        </div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma campanha criada ainda — crie uma lista com contatos e depois uma campanha.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                tenantSlug={tenantSlug}
                connectionId={connectionId}
                campaign={campaign}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
