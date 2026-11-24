"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { formatSpDateTime } from "./campaign-status";

/** "AAAA-MM-DDTHH:mm" no fuso do navegador, pro min do datetime-local. */
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Gate for both a first start (DRAFT) and a resume (PAUSED) — the consent
 * checkbox is only actually required the first time (see
 * campaign.service.ts's startCampaign, which keeps consentConfirmed true
 * forever once given), but showing/requiring it every time is simpler and
 * harmless: re-confirming isn't wrong.
 *
 * "Agendar": a campanha fica SCHEDULED e o dispatcher a coloca em
 * andamento sozinho no horário escolhido (sempre dentro da janela de envio
 * da conexão — se o horário cair fora, começa na abertura seguinte). */
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
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [minSchedule, setMinSchedule] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    let scheduledStartAt: string | null = null;
    if (mode === "schedule") {
      const date = scheduleAt ? new Date(scheduleAt) : null;
      if (!date || Number.isNaN(date.getTime())) {
        setError("Escolha a data e o horário de início.");
        return;
      }
      scheduledStartAt = date.toISOString();
    }
    setSubmitting(true);
    const result = await startCampaignAction(tenantSlug, { campaignId, consentConfirmed: consent, scheduledStartAt });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    if (result.data.status === "SCHEDULED") {
      setNotice(`Agendada — primeira mensagem prevista para ${formatSpDateTime(result.data.firstSendAt)} (horário de Brasília).`);
      router.refresh();
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
          setNotice(null);
          setMode("now");
          const min = new Date(Date.now() + 5 * 60 * 1000);
          setMinSchedule(toLocalInputValue(min));
          setScheduleAt("");
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
            As mensagens saem uma por vez, com o intervalo e a janela de horário configurados para essa
            conexão (e o limite diário / aquecimento do número).
          </DialogDescription>
        </DialogHeader>

        {notice ? (
          <>
            <p className="text-sm">{notice}</p>
            <DialogFooter className="mt-2">
              <Button onClick={() => setOpen(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "now" ? "default" : "outline"} onClick={() => setMode("now")}>
                <Play className="size-4" />
                Começar agora
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "schedule" ? "default" : "outline"}
                onClick={() => setMode("schedule")}
              >
                <CalendarClock className="size-4" />
                Agendar
              </Button>
            </div>

            {mode === "schedule" && (
              <div className="space-y-1">
                <Label htmlFor="campaign-schedule-at">Início</Label>
                <Input
                  id="campaign-schedule-at"
                  type="datetime-local"
                  min={minSchedule}
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  No horário do seu navegador. Até 60 dias à frente.
                </p>
              </div>
            )}

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
                {submitting ? "Salvando…" : mode === "schedule" ? "Agendar" : label}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
