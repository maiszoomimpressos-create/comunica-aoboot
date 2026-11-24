import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getCampaignDetail } from "@/services/campaign.service";
import { assertConnectionAccessOrNotFound } from "@/lib/rbac/connection-scope";
import { NotFoundError } from "@/lib/server/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignRecipientsTable } from "@/components/dashboard/whatsapp/campaigns/campaign-recipients-table";
import { CampaignActions } from "@/components/dashboard/whatsapp/campaigns/campaign-actions";
import { CampaignMetrics } from "@/components/dashboard/whatsapp/campaigns/campaign-metrics";
import { CampaignLiveRefresh } from "@/components/dashboard/whatsapp/campaigns/campaign-live-refresh";
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_VARIANT,
  RECIPIENT_STATUS_LABEL,
  formatSpDateTime,
} from "@/components/dashboard/whatsapp/campaigns/campaign-status";
import type { CampaignRecipientRow } from "@/repositories/campaign.repository";

export const metadata: Metadata = { title: "Campanha" };

const PAGE_SIZE = 50;
const FILTERABLE_STATUSES = Object.keys(RECIPIENT_STATUS_LABEL) as CampaignRecipientRow["status"][];

const PART_LABEL: Record<string, string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  audio: "Áudio",
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string; campaignId: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { tenantSlug, connectionId, campaignId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "campaigns.view");
  assertConnectionAccessOrNotFound(ctx, connectionId);
  const canManage = ctx.permissions.includes("campaigns.manage");

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = FILTERABLE_STATUSES.includes(sp.status as CampaignRecipientRow["status"])
    ? (sp.status as CampaignRecipientRow["status"])
    : null;

  const detail = await getCampaignDetail(ctx.tenantId, campaignId, { page, pageSize: PAGE_SIZE, status }).catch(
    (err) => {
      if (err instanceof NotFoundError) notFound();
      throw err;
    }
  );
  if (detail.connectionId !== connectionId) notFound();

  const baseHref = `/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}/${campaignId}`;
  const hrefFor = (next: { page?: number; status?: string | null }) => {
    const q = new URLSearchParams();
    const nextStatus = next.status === undefined ? status : next.status;
    if (nextStatus) q.set("status", nextStatus);
    const nextPage = next.page ?? 1;
    if (nextPage > 1) q.set("page", String(nextPage));
    const qs = q.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };
  const totalPages = Math.max(1, Math.ceil(detail.filteredTotal / detail.pageSize));
  const isLive = detail.status === "RUNNING" || detail.status === "SCHEDULED";

  return (
    <div className="max-w-4xl space-y-6">
      <CampaignLiveRefresh active={isLive} />
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}?tab=campanhas`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Campanhas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
            <Badge variant={CAMPAIGN_STATUS_VARIANT[detail.status]}>{CAMPAIGN_STATUS_LABEL[detail.status]}</Badge>
          </div>
          <p className="text-muted-foreground">
            {detail.connectionName} · Lista: {detail.listName}
          </p>
          <p className="text-xs text-muted-foreground">
            {detail.status === "SCHEDULED" && detail.scheduledStartAt
              ? `Agendada para ${formatSpDateTime(detail.scheduledStartAt)}`
              : detail.startedAt
                ? `Iniciada em ${formatSpDateTime(detail.startedAt)}`
                : `Criada em ${formatSpDateTime(detail.createdAt)}`}
            {detail.finishedAt && ` · Finalizada em ${formatSpDateTime(detail.finishedAt)}`} (horário de Brasília)
            {isLive && " · atualiza sozinha a cada 15 s"}
          </p>
        </div>
        {canManage && (
          <CampaignActions
            tenantSlug={tenantSlug}
            campaign={{
              id: detail.id,
              name: detail.name,
              status: detail.status,
              failedCount: detail.counts.FAILED ?? 0,
            }}
          />
        )}
      </div>

      {detail.status === "PAUSED" && detail.pausedReason && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {detail.pausedReason}
        </p>
      )}

      <CampaignMetrics counts={detail.counts} total={detail.total} />

      <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium">
          {detail.parts.length > 1 ? `Sequência (${detail.parts.length} mensagens, nesta ordem)` : "Mensagem (modelo)"}
          {detail.parts.length > 1 && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {detail.minPartIntervalSeconds}–{detail.maxPartIntervalSeconds} s entre elas
            </span>
          )}
        </p>
        <ol className="space-y-2">
          {detail.parts.map((part, i) => (
            <li key={i} className="rounded-md bg-background p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                {i + 1}. {PART_LABEL[part.type] ?? part.type}
                {part.fileName ? ` (${part.fileName})` : ""}
              </p>
              {part.mediaUrl && (
                <a
                  href={part.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-xs text-muted-foreground underline"
                >
                  {part.mediaUrl}
                </a>
              )}
              {part.text && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{part.text}</p>}
            </li>
          ))}
        </ol>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">
            Destinatários ({detail.filteredTotal}
            {status ? ` · ${RECIPIENT_STATUS_LABEL[status].toLowerCase()}` : ""})
          </h2>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={status === null ? "default" : "outline"} nativeButton={false} render={<Link href={hrefFor({ status: null })} />}>
            Todos ({detail.total})
          </Button>
          {FILTERABLE_STATUSES.filter((s) => (detail.counts[s] ?? 0) > 0).map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} nativeButton={false} render={<Link href={hrefFor({ status: s })} />}>
              {RECIPIENT_STATUS_LABEL[s]} ({detail.counts[s] ?? 0})
            </Button>
          ))}
        </div>

        <CampaignRecipientsTable recipients={detail.recipients} totalParts={detail.parts.length} />

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Página {detail.page} de {totalPages}
            </span>
            <div className="flex gap-2">
              {detail.page > 1 ? (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={hrefFor({ page: detail.page - 1 })} />}>
                  Anterior
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Anterior
                </Button>
              )}
              {detail.page < totalPages ? (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={hrefFor({ page: detail.page + 1 })} />}>
                  Próxima
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Próxima
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
