"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pause, RotateCcw } from "lucide-react";
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
import { retryFailedRecipientsAction } from "@/actions/campaigns/retry-failed-recipients";
import type { CampaignListRow } from "@/repositories/campaign.repository";

/** Botões de controle de uma campanha — usados no card da lista e na tela
 * de detalhe. Pausar/cancelar valem no meio do envio: o dispatcher
 * reconfere o status antes de cada mensagem. */
export function CampaignActions({
  tenantSlug,
  campaign,
}: {
  tenantSlug: string;
  campaign: { id: string; name: string; status: CampaignListRow["status"]; failedCount: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "pause" | "cancel" | "retry">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "pause" | "cancel" | "retry") {
    setBusy(kind);
    setError(null);
    const action =
      kind === "pause" ? pauseCampaignAction : kind === "cancel" ? cancelCampaignAction : retryFailedRecipientsAction;
    const result = await action(tenantSlug, { campaignId: campaign.id });
    setBusy(null);
    if (!result.success) setError(result.error.message);
    router.refresh();
  }

  const { status } = campaign;
  const canRetry = (status === "PAUSED" || status === "COMPLETED") && campaign.failedCount > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(status === "DRAFT" || status === "PAUSED") && (
          <StartCampaignDialog tenantSlug={tenantSlug} campaignId={campaign.id} label={status === "DRAFT" ? "Iniciar" : "Retomar"} />
        )}
        {(status === "RUNNING" || status === "SCHEDULED") && (
          <Button variant="outline" size="sm" onClick={() => run("pause")} disabled={busy !== null}>
            <Pause className="size-4" />
            {busy === "pause" ? "Pausando…" : "Pausar"}
          </Button>
        )}
        {canRetry && (
          <Button variant="outline" size="sm" onClick={() => run("retry")} disabled={busy !== null}>
            <RotateCcw className="size-4" />
            {busy === "retry" ? "Reenfileirando…" : `Reenviar falhas (${campaign.failedCount})`}
          </Button>
        )}
        {status !== "COMPLETED" && status !== "CANCELLED" && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={busy !== null} />}>
              <Ban className="size-4" />
              Cancelar
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar campanha &ldquo;{campaign.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  Destinatários ainda pendentes não recebem mensagem (uma mensagem que já estiver saindo
                  neste segundo ainda pode chegar). Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={() => run("cancel")}>Cancelar campanha</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
