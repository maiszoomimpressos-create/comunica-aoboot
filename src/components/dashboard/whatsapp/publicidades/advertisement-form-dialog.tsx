"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdvertisementView } from "@/services/advertisement.service";
import { saveAdvertisementAction } from "@/actions/whatsapp/save-advertisement";
import {
  ADVERTISEMENT_BUTTONS_ENABLED,
  DELETE_AFTER_OPTIONS,
  MAX_AD_TEXT_LENGTH,
  MAX_FREQUENCY_VALUE,
  planAdvertisementMessage,
  validateAdvertisementInput,
  type AdvertisementFrequencyMode,
} from "@/lib/advertisements/advertisement-rules";
import { MAX_LINK_BUTTON_LABEL } from "@/lib/notifications/custom-link-buttons";
import { MessageImageInput } from "../message-blocks/message-image-input";
import { WhatsappBubblesPreview } from "../message-blocks/whatsapp-bubbles-preview";
import type { AdvertisementConnectionOption } from "./advertisements-manager";

/** ISO -> valor de <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
        selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Formulário de publicidade (criar/editar), com prévia de como chega no
 * WhatsApp ao lado. Banner em cima e texto embaixo: um balão só. O botão de
 * link fica escondido enquanto ADVERTISEMENT_BUTTONS_ENABLED for false; o link
 * vai no próprio texto.
 */
export function AdvertisementFormDialog({
  tenantSlug,
  connections,
  advertisement,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  connections: AdvertisementConnectionOption[];
  advertisement: AdvertisementView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [connectionId, setConnectionId] = useState(advertisement?.connectionId ?? connections[0]?.id ?? "");
  const [name, setName] = useState(advertisement?.name ?? "");
  const [imageUrl, setImageUrl] = useState(advertisement?.imageUrl ?? "");
  const [messageText, setMessageText] = useState(advertisement?.messageText ?? "");
  const [buttonLabel, setButtonLabel] = useState(advertisement?.buttonLabel ?? "");
  const [buttonUrl, setButtonUrl] = useState(advertisement?.buttonUrl ?? "");
  const [active, setActive] = useState(advertisement?.active ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(advertisement?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(advertisement?.endsAt ?? null));
  const [triggerTypeKeys, setTriggerTypeKeys] = useState<string[]>(advertisement?.triggerTypeKeys ?? []);
  const [frequencyMode, setFrequencyMode] = useState<AdvertisementFrequencyMode>(advertisement?.frequencyMode ?? "PER_DAY");
  const [frequencyValue, setFrequencyValue] = useState(String(advertisement?.frequencyValue ?? 1));
  const [deleteAfterHours, setDeleteAfterHours] = useState<number | null>(advertisement?.deleteAfterHours ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection = connections.find((c) => c.id === connectionId);
  const plan = useMemo(
    () => planAdvertisementMessage({ imageUrl: imageUrl || null, messageText, buttonLabel, buttonUrl }),
    [imageUrl, messageText, buttonLabel, buttonUrl]
  );

  function toggleTrigger(key: string, checked: boolean) {
    setTriggerTypeKeys((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));
  }

  async function handleSave() {
    setError(null);
    const input = {
      ...(advertisement ? { id: advertisement.id } : {}),
      connectionId,
      name,
      imageUrl: imageUrl.trim() || null,
      messageText,
      buttonLabel: buttonLabel.trim() || null,
      buttonUrl: buttonUrl.trim() || null,
      active,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      triggerTypeKeys,
      frequencyMode,
      frequencyValue: Number(frequencyValue),
      deleteAfterHours,
    };
    const problems = validateAdvertisementInput({
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    });
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }
    setSaving(true);
    const result = await saveAdvertisementAction(tenantSlug, input);
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{advertisement ? "Editar publicidade" : "Nova publicidade"}</DialogTitle>
          <DialogDescription>
            Chega alguns segundos depois da função escolhida, só para quem acabou de recebê-la.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-6 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="space-y-5">
            {connections.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Número de WhatsApp</Label>
                <Select
                  value={connectionId}
                  onValueChange={(v) => {
                    if (typeof v !== "string") return;
                    setConnectionId(v);
                    setTriggerTypeKeys([]);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string) => {
                        const c = connections.find((item) => item.id === v);
                        return c ? `${c.name} · ${c.phoneNumber}` : "Escolha";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.phoneNumber}
                        {!c.connected ? " (desconectado)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="ad-name" className="text-xs text-muted-foreground">
                Nome (só você vê)
              </Label>
              <Input id="ad-name" value={name} maxLength={120} placeholder="Ex.: Cupom de novembro" onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Banner</Label>
              <MessageImageInput tenantSlug={tenantSlug} value={imageUrl} onChange={setImageUrl} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="ad-text" className="text-xs text-muted-foreground">
                  Texto
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {messageText.length}/{MAX_AD_TEXT_LENGTH}
                </span>
              </div>
              <Textarea
                id="ad-text"
                rows={4}
                value={messageText}
                maxLength={MAX_AD_TEXT_LENGTH}
                placeholder="Ex.: 🎉 *10% OFF* na próxima corrida com o cupom VOLTA10"
                onChange={(e) => setMessageText(e.target.value)}
              />
            </div>

            {!ADVERTISEMENT_BUTTONS_ENABLED ? (
              <p className="text-xs text-muted-foreground">
                Quer mandar um link? Escreva ele no próprio texto (ex.: https://seusite.com.br/oferta) — no WhatsApp ele
                fica clicável.
              </p>
            ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Botão de link (opcional)</Label>
              <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Input
                  value={buttonLabel}
                  maxLength={MAX_LINK_BUTTON_LABEL}
                  placeholder="Nome, ex.: Ver oferta"
                  onChange={(e) => setButtonLabel(e.target.value)}
                />
                <Input value={buttonUrl} placeholder="https://..." onChange={(e) => setButtonUrl(e.target.value)} />
              </div>
            </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Enviar depois de qual função?</Label>
              {!connection || connection.functions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Este número ainda não tem funções. Crie uma em Funções.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {connection.functions.map((fn) => (
                    <label key={fn.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={triggerTypeKeys.includes(fn.key)}
                        onCheckedChange={(checked) => toggleTrigger(fn.key, checked === true)}
                      />
                      <span className="min-w-0 truncate">{fn.label}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Só vai quando a mensagem da função sair com sucesso.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ad-start" className="text-xs text-muted-foreground">
                  Começa em (opcional)
                </Label>
                <Input id="ad-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ad-end" className="text-xs text-muted-foreground">
                  Termina em (opcional)
                </Label>
                <Input id="ad-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quantas vezes a mesma pessoa pode receber</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceButton selected={frequencyMode === "PER_DAY"} onClick={() => setFrequencyMode("PER_DAY")}>
                  <span className="font-medium">Por dia</span>
                  <br />
                  No máximo N publicidades por pessoa a cada 24 horas
                </ChoiceButton>
                <ChoiceButton selected={frequencyMode === "EVERY_N_SENDS"} onClick={() => setFrequencyMode("EVERY_N_SENDS")}>
                  <span className="font-medium">A cada N envios</span>
                  <br />
                  Ex.: 3 = só na 3ª, 6ª, 9ª corrida da pessoa
                </ChoiceButton>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">N =</span>
                <Input
                  type="number"
                  min={1}
                  max={MAX_FREQUENCY_VALUE}
                  value={frequencyValue}
                  onChange={(e) => setFrequencyValue(e.target.value)}
                  className="h-8 w-20"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                O limite vale somando todas as publicidades deste número. Se houver mais de uma no ar, elas se revezam.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Apagar depois de</Label>
              <div className="flex flex-wrap gap-2">
                {DELETE_AFTER_OPTIONS.map((option) => (
                  <ChoiceButton
                    key={String(option.value)}
                    selected={deleteAfterHours === option.value}
                    onClick={() => setDeleteAfterHours(option.value)}
                  >
                    {option.label}
                  </ChoiceButton>
                ))}
              </div>
              {deleteAfterHours !== null && (
                <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    A publicidade é apagada para todos no prazo, e no lugar aparece &quot;Mensagem apagada&quot;. O
                    passageiro pode ter visto, tirado print ou salvo a imagem antes. O WhatsApp só permite apagar até
                    2 dias depois do envio, por isso não há opção maior.
                  </p>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">
                Ativa
                <span className="block text-[11px] text-muted-foreground">Desligada, não envia para ninguém.</span>
              </span>
              <Switch checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
            </label>
          </div>

          <div className="space-y-2 md:sticky md:top-0 md:self-start">
            <p className="text-xs font-medium text-muted-foreground">Prévia no WhatsApp</p>
            <WhatsappBubblesPreview
              deliveries={plan.deliveries}
              warnings={plan.warnings}
              emptyText="Escolha um banner ou escreva o texto."
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {advertisement ? "Salvar" : "Criar publicidade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
