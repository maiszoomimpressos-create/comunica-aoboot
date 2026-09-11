"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { startCampaignAction } from "@/actions/campaigns/start-campaign";

/** Gate for both a first start (DRAFT) and a resume (PAUSED) — the consent
 * checkbox is only actually required the first time (see
 * campaign.service.ts's startCampaign, which keeps consentConfirmed true
 * forever once given), but showing/requiring it every time is simpler and
 * harmless: re-confirming isn't wrong. */
export function StartCampaignDialog({
  tenantSlug,
  campaignId,
  label,
}: {
  tenantSlug: string;
  campaignId: string;
  label: "Iniciar" | "Retomar";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await startCampaignAction(tenantSlug, { campaignId, consentConfirmed: consent });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setConsent(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Play className="size-4" />
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} campanha</DialogTitle>
          <DialogDescription>
            As mensagens começam a sair respeitando o ritmo e a janela de horário configurados para
            essa conexão.
          </DialogDescription>
        </DialogHeader>

        <Label className="flex items-start gap-2 text-sm font-normal">
          <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
          <span>Confirmo que minha empresa tem base legal para enviar mensagens para essa lista de contatos.</span>
        </Label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-2">
          <Button onClick={handleConfirm} disabled={!consent || submitting}>
            {submitting ? "Iniciando…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
