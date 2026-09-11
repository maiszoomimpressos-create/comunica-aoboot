import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getCampaignDetail } from "@/services/campaign.service";
import { NotFoundError } from "@/lib/server/errors";
import { Badge } from "@/components/ui/badge";
import { StartCampaignDialog } from "@/components/dashboard/whatsapp/campaigns/start-campaign-dialog";
import { CampaignRecipientsTable } from "@/components/dashboard/whatsapp/campaigns/campaign-recipients-table";

export const metadata: Metadata = { title: "Campanha" };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em andamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string; campaignId: string }>;
}) {
  const { tenantSlug, connectionId, campaignId } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "campaigns.view");
  const canManage = ctx.permissions.includes("campaigns.manage");

  const detail = await getCampaignDetail(ctx.tenantId, campaignId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Campanhas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
            <Badge variant="outline">{STATUS_LABEL[detail.status] ?? detail.status}</Badge>
          </div>
          <p className="text-muted-foreground">
            {detail.connectionName} · Lista: {detail.listName}
          </p>
        </div>
        {canManage && (detail.status === "DRAFT" || detail.status === "PAUSED") && (
          <StartCampaignDialog
            tenantSlug={tenantSlug}
            campaignId={detail.id}
            label={detail.status === "DRAFT" ? "Iniciar" : "Retomar"}
          />
        )}
      </div>

      {detail.pausedReason && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {detail.pausedReason}
        </p>
      )}

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium">Mensagem</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{detail.messageText}</p>
        {detail.mediaType && (
          <p className="mt-2 text-xs text-muted-foreground">
            Mídia ({detail.mediaType}): {detail.mediaUrl}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Destinatários ({detail.recipients.length})</h2>
        <CampaignRecipientsTable recipients={detail.recipients} />
      </section>
    </div>
  );
}
