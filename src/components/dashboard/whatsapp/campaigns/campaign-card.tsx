"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StartCampaignDialog } from "./start-campaign-dialog";
import { pauseCampaignAction } from "@/actions/campaigns/pause-campaign";
import { cancelCampaignAction } from "@/actions/campaigns/cancel-campaign";
import type { CampaignListRow } from "@/repositories/campaign.repository";

const STATUS_LABEL: Record<CampaignListRow["status"], string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  RUNNING: "Em andamento",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<CampaignListRow["status"], "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SCHEDULED: "outline",
  RUNNING: "default",
  PAUSED: "secondary",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

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
  const router = useRouter();
  const [pausing, setPausing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const sent = campaign.counts.SENT ?? 0;
  const failed = campaign.counts.FAILED ?? 0;
  const optedOut = campaign.counts.OPTED_OUT ?? 0;
  const pending = (campaign.counts.PENDING ?? 0) + (campaign.counts.PROCESSING ?? 0);

  async function handlePause() {
    setPausing(true);
    await pauseCampaignAction(tenantSlug, { campaignId: campaign.id });
    setPausing(false);
    router.refresh();
  }

  async function handleCancel() {
    setCancelling(true);
    await cancelCampaignAction(tenantSlug, { campaignId: campaign.id });
    setCancelling(false);
    router.refresh();
  }

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
        <Badge variant={STATUS_VARIANT[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {sent} enviada(s) · {pending} pendente(s) · {failed} falhou(aram) · {optedOut} opt-out ·{" "}
        {campaign.total} no total
      </p>

      {campaign.status === "PAUSED" && campaign.pausedReason && (
        <p className="text-sm text-destructive">{campaign.pausedReason}</p>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(campaign.status === "DRAFT" || campaign.status === "PAUSED") && (
            <StartCampaignDialog
              tenantSlug={tenantSlug}
              campaignId={campaign.id}
              label={campaign.status === "DRAFT" ? "Iniciar" : "Retomar"}
            />
          )}
          {campaign.status === "RUNNING" && (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={pausing}>
              {pausing ? "Pausando…" : "Pausar"}
            </Button>
          )}
          {(campaign.status === "DRAFT" || campaign.status === "RUNNING" || campaign.status === "PAUSED") && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={cancelling} />}>
                <Ban className="size-4" />
                Cancelar
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar campanha &ldquo;{campaign.name}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Destinatários ainda pendentes não recebem mensagem. Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel}>Cancelar campanha</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </Card>
  );
}
