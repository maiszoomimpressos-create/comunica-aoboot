"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CampaignListRow } from "@/repositories/campaign.repository";
import { CampaignActions } from "./campaign-actions";
import { CampaignMetrics } from "./campaign-metrics";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_VARIANT, formatSpDateTime } from "./campaign-status";

export function CampaignCard({
  tenantSlug,
  connectionId,
  campaign,
  canManage,
}: {
  tenantSlug: string;
  connectionId: string;
  campaign: CampaignListRow;
  canManage: boolean;
}) {
  const detailHref = `/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}/${campaign.id}`;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={detailHref} className="truncate font-medium hover:underline">
            {campaign.name}
          </Link>
          <p className="text-sm text-muted-foreground">Lista: {campaign.listName}</p>
        </div>
        <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</Badge>
      </div>

      {campaign.status === "SCHEDULED" && campaign.scheduledStartAt && (
        <p className="text-sm text-muted-foreground">Começa em {formatSpDateTime(campaign.scheduledStartAt)} (Brasília)</p>
      )}

      <CampaignMetrics counts={campaign.counts} total={campaign.total} compact />

      {campaign.status === "PAUSED" && campaign.pausedReason && (
        <p className="text-sm text-destructive">{campaign.pausedReason}</p>
      )}

      {canManage && (
        <CampaignActions
          tenantSlug={tenantSlug}
          campaign={{
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            failedCount: campaign.counts.FAILED ?? 0,
          }}
        />
      )}
    </Card>
  );
}
