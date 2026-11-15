"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ImageIcon, Megaphone, Pencil, Plus, Send, Timer, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdvertisementView } from "@/services/advertisement.service";
import { deleteAdvertisementAction, setAdvertisementActiveAction } from "@/actions/whatsapp/save-advertisement";
import { DELETE_AFTER_OPTIONS } from "@/lib/advertisements/advertisement-rules";
import { AdvertisementFormDialog } from "./advertisement-form-dialog";

export interface AdvertisementConnectionOption {
  id: string;
  name: string;
  phoneNumber: string;
  connected: boolean;
  functions: { key: string; label: string }[];
}

type Status = { label: string; variant: "default" | "secondary" | "outline" | "destructive" };

function statusOf(ad: AdvertisementView, now: number): Status {
  if (!ad.active) return { label: "Pausada", variant: "outline" };
  if (ad.endsAt && new Date(ad.endsAt).getTime() < now) return { label: "Encerrada", variant: "outline" };
  if (ad.startsAt && new Date(ad.startsAt).getTime() > now) return { label: "Agendada", variant: "secondary" };
  return { label: "No ar", variant: "default" };
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function periodText(ad: AdvertisementView): string {
  if (ad.startsAt && ad.endsAt) return `${formatDate(ad.startsAt)} até ${formatDate(ad.endsAt)}`;
  if (ad.startsAt) return `A partir de ${formatDate(ad.startsAt)}`;
  if (ad.endsAt) return `Até ${formatDate(ad.endsAt)}`;
  return "Sem data para acabar";
}

function frequencyText(ad: AdvertisementView): string {
  return ad.frequencyMode === "EVERY_N_SENDS"
    ? `1 a cada ${ad.frequencyValue} envio(s) para a mesma pessoa`
    : `Até ${ad.frequencyValue} por pessoa por dia`;
}

/**
 * Tela WhatsApp > Publicidades: lista as publicidades da empresa com
 * situação, função que dispara, período, limite e quantas já foram
 * enviadas; criar/editar abre o formulário com prévia ao lado.
 */
export function AdvertisementsManager({
  tenantSlug,
  ready,
  canManage,
  connections,
  advertisements,
}: {
  tenantSlug: string;
  ready: boolean;
  canManage: boolean;
  connections: AdvertisementConnectionOption[];
  advertisements: AdvertisementView[];
}) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState<AdvertisementView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdvertisementView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const functionLabel = (connectionId: string, key: string) =>
    connections.find((c) => c.id === connectionId)?.functions.find((f) => f.key === key)?.label ?? key;

  async function toggleActive(ad: AdvertisementView, active: boolean) {
    setBusyId(ad.id);
    setError(null);
    const result = await setAdvertisementActiveAction(tenantSlug, { id: ad.id, active });
    setBusyId(null);
    if (!result.success) setError(result.error.message);
    else router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    const result = await deleteAdvertisementAction(tenantSlug, { id: deleting.id });
    setBusyId(null);
    setDeleting(null);
    if (!result.success) setError(result.error.message);
    else router.refresh();
  }

  if (!ready) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium text-foreground">Publicidades ainda não estão ativadas</p>
          <p className="text-muted-foreground">
            Falta um passo técnico no sistema para guardar as publicidades. Enquanto isso, nada muda nas mensagens
            que já são enviadas.
          </p>
        </div>
      </div>
    );
  }

  const totalSent = advertisements.reduce((sum, ad) => sum + ad.sentCount, 0);
  const liveCount = advertisements.filter((ad) => statusOf(ad, now).label === "No ar").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">No ar</p>
            <p className="text-lg font-semibold">{liveCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Enviadas</p>
            <p className="text-lg font-semibold">{totalSent}</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)} disabled={connections.length === 0}>
            <Plus className="size-4" />
            Nova publicidade
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {advertisements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Megaphone className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma publicidade ainda</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {connections.length === 0
              ? "Conecte um número de WhatsApp primeiro."
              : "Crie a primeira: escolha um banner, escreva a mensagem e diga depois de qual função ela vai."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {advertisements.map((ad) => {
            const status = statusOf(ad, now);
            const deleteLabel = DELETE_AFTER_OPTIONS.find((o) => o.value === ad.deleteAfterHours)?.label ?? "Não apagar";
            return (
              <div key={ad.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {ad.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- banner do Blob/URL externa
                    <img src={ad.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ad.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {ad.triggerTypeKeys.map((key) => (
                          <Badge key={key} variant="outline" className="font-normal">
                            depois de {functionLabel(ad.connectionId, key)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <Switch
                        checked={ad.active}
                        disabled={busyId === ad.id}
                        onCheckedChange={(checked) => toggleActive(ad, checked === true)}
                        aria-label="Ativa"
                      />
                    )}
                  </div>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5" /> {periodText(ad)}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Send className="size-3.5" /> {frequencyText(ad)} · {ad.sentCount} enviada(s)
                      {ad.failedCount > 0 ? ` · ${ad.failedCount} com falha` : ""}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Timer className="size-3.5" /> Apagar depois de: {deleteLabel}
                    </li>
                  </ul>
                  {canManage && (
                    <div className="flex gap-1 pt-1">
                      <Button variant="outline" size="xs" onClick={() => setEditing(ad)}>
                        <Pencil /> Editar
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDeleting(ad)} disabled={busyId === ad.id}>
                        <Trash2 /> Excluir
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <AdvertisementFormDialog
          tenantSlug={tenantSlug}
          connections={connections}
          advertisement={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir &quot;{deleting?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              A publicidade para de ser enviada e some desta lista, junto com a contagem de envios. As mensagens já
              entregues continuam no WhatsApp de quem recebeu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
