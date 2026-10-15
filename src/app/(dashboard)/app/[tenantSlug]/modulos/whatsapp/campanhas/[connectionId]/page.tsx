import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, List, Send } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import {
  getConnectionForCampaigns,
  getContactsGroupedByList,
  getListsForTenant,
} from "@/services/whatsapp-contacts.service";
import { listCampaignsForConnection, getConnectionCampaignSettings } from "@/services/campaign.service";
import { SyncContactsButton } from "@/components/dashboard/whatsapp/campaigns/sync-contacts-button";
import { SyncGroupDialog } from "@/components/dashboard/whatsapp/campaigns/sync-group-dialog";
import { CollapsibleContactsSection } from "@/components/dashboard/whatsapp/campaigns/collapsible-contacts-section";
import { ContactListCard } from "@/components/dashboard/whatsapp/campaigns/contact-list-card";
import { CreateAssembledListDialog } from "@/components/dashboard/whatsapp/campaigns/create-assembled-list-dialog";
import { CreateCampaignDialog } from "@/components/dashboard/whatsapp/campaigns/create-campaign-dialog";
import { CampaignCard } from "@/components/dashboard/whatsapp/campaigns/campaign-card";
import { CampaignSettingsDialog } from "@/components/dashboard/whatsapp/campaigns/campaign-settings-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Campanhas" };

const VALID_TABS = ["contatos", "listas", "campanhas"] as const;

export default async function CampaignsConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenantSlug, connectionId } = await params;
  const { tab } = await searchParams;
  const initialTab = (VALID_TABS as readonly string[]).includes(tab ?? "") ? tab! : "contatos";

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

  const [contactsByList, tenantLists, campaigns, campaignSettings] = await Promise.all([
    getContactsGroupedByList(ctx.tenantId, connectionId),
    getListsForTenant(ctx.tenantId),
    listCampaignsForConnection(ctx.tenantId, connectionId),
    getConnectionCampaignSettings(ctx.tenantId, connectionId),
  ]);

  const extractedLists = tenantLists.filter((l) => l.type === "EXTRACTED");
  const assembledLists = tenantLists.filter((l) => l.type === "ASSEMBLED");

  // A lista da agenda inteira (sourceGroupId null) é a única que conta pra
  // esse resumo — as de grupo são subconjuntos dela, somar duplicaria.
  const mainListEntry = contactsByList.find((entry) => !entry.list.sourceGroupId) ?? null;
  const totalContacts = mainListEntry?.contacts.length ?? 0;
  const activeContacts = mainListEntry?.contacts.filter((c) => !c.optedOut).length ?? 0;

  return (
    <div className="max-w-4xl space-y-6">
      {backLink}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="text-muted-foreground">
          {connection.connectionName} ({connection.phoneNumber})
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="contatos">
            <Users className="size-4" />
            Contatos
          </TabsTrigger>
          <TabsTrigger value="listas">
            <List className="size-4" />
            Listas
          </TabsTrigger>
          <TabsTrigger value="campanhas">
            <Send className="size-4" />
            Campanhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="space-y-4 pt-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {activeContacts} contato(s) ativo(s) de {totalContacts} sincronizado(s).
            </p>
            {canManage && (
              <div className="flex gap-2">
                <SyncGroupDialog tenantSlug={tenantSlug} connectionId={connectionId} />
                <SyncContactsButton tenantSlug={tenantSlug} connectionId={connectionId} />
              </div>
            )}
          </div>

          {contactsByList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum contato sincronizado ainda — clique em &ldquo;Sincronizar contatos&rdquo;.
            </p>
          ) : (
            <div className="space-y-3">
              {contactsByList.map(({ list, contacts: listContacts }) => (
                <CollapsibleContactsSection
                  key={list.id}
                  title={list.name}
                  isGroup={!!list.sourceGroupId}
                  originLabel={list.sourceGroupId ? "grupo" : `de ${list.originPhoneNumber}`}
                  contacts={listContacts}
                  tenantSlug={tenantSlug}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="listas" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Todas as listas do tenant, de qualquer número conectado — não só deste.
          </p>
          <Tabs defaultValue="extraidas">
            <TabsList>
              <TabsTrigger value="extraidas">Extraídas ({extractedLists.length})</TabsTrigger>
              <TabsTrigger value="montadas">Montadas ({assembledLists.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="extraidas" className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Nascem da sincronização de um número — pra criar uma nova, sincronize os contatos na aba
                Contatos do número desejado.
              </p>
              {extractedLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma lista extraída ainda.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {extractedLists.map((list) => (
                    <ContactListCard key={list.id} tenantSlug={tenantSlug} list={list} canManage={canManage} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="montadas" className="space-y-4 pt-2">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Sem número de origem — junte contatos de uma ou mais listas extraídas.
                </p>
                {canManage && <CreateAssembledListDialog tenantSlug={tenantSlug} />}
              </div>
              {assembledLists.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma lista montada ainda.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {assembledLists.map((list) => (
                    <ContactListCard key={list.id} tenantSlug={tenantSlug} list={list} canManage={canManage} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="campanhas" className="space-y-4 pt-2">
          <div className="flex items-center justify-end gap-2">
            {canManage && (
              <>
                <CampaignSettingsDialog tenantSlug={tenantSlug} connectionId={connectionId} settings={campaignSettings} />
                <CreateCampaignDialog tenantSlug={tenantSlug} connectionId={connectionId} lists={tenantLists} />
              </>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
