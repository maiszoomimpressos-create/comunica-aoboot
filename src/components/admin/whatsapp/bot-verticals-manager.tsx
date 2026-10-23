"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBotVerticalAction } from "@/actions/admin/create-bot-vertical";
import { updateBotVerticalAction } from "@/actions/admin/update-bot-vertical";
import type { BotVertical } from "@/generated/prisma/client";

/** Super Admin-only: manages the catalog of business verticals (mobilidade,
 * delivery, ...) the AI attendant can be configured as — see BotVertical.
 * Each vertical's `systemPrompt` ("treino") is what bot-attendant.service.ts
 * attaches as the model's base instructions once a tenant picks it in
 * BotAttendantSection. New verticals are added here, not by tenants. */
export function BotVerticalsManager({ verticals }: { verticals: BotVertical[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nichos do atendente de IA</CardTitle>
        <CardDescription>
          Cada nicho define o treino (prompt) base que o atendente usa. O tenant escolhe um nicho na
          configuração do bot; o texto livre que ele escreve lá é só um complemento disso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {verticals.map((vertical) => (
          <BotVerticalRow key={vertical.id} vertical={vertical} />
        ))}
        <NewBotVerticalDialog />
      </CardContent>
    </Card>
  );
}

function BotVerticalRow({ vertical }: { vertical: BotVertical }) {
  const router = useRouter();
  const [label, setLabel] = useState(vertical.label);
  const [systemPrompt, setSystemPrompt] = useState(vertical.systemPrompt);
  const [requiresFixedLocation, setRequiresFixedLocation] = useState(vertical.requiresFixedLocation);
  const [active, setActive] = useState(vertical.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: {
    label: string;
    systemPrompt: string;
    requiresFixedLocation: boolean;
    active: boolean;
  }) {
    setSaving(true);
    setError(null);
    const result = await updateBotVerticalAction({ id: vertical.id, ...next });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  function handleActiveChange(next: boolean) {
    setActive(next);
    save({ label, systemPrompt, requiresFixedLocation, active: next });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-xs font-medium"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ativo</span>
          <Switch checked={active} disabled={saving} onCheckedChange={handleActiveChange} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Chave: <code>{vertical.key}</code>
      </p>

      <Textarea
        className="mt-3"
        rows={6}
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />

      <Label className="mt-3 flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={requiresFixedLocation}
          onCheckedChange={(checked) => setRequiresFixedLocation(checked === true)}
        />
        Negócio com endereço fixo (loja), não corridas de origem/destino livres
      </Label>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => save({ label, systemPrompt, requiresFixedLocation, active })}
        >
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function NewBotVerticalDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [requiresFixedLocation, setRequiresFixedLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKey("");
    setLabel("");
    setSystemPrompt("");
    setRequiresFixedLocation(false);
    setError(null);
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const result = await createBotVerticalAction({ key, label, systemPrompt, requiresFixedLocation });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-4" />
        Novo nicho
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo nicho</DialogTitle>
          <DialogDescription>
            Cria um novo nicho pro atendente de IA, pra tenants dessa área escolherem na configuração do
            bot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor="vertical-key">Chave</FieldLabel>
            <Input
              id="vertical-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ex: lanchonete"
            />
            <FieldDescription>Minúsculas, números e underscore — não muda depois.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="vertical-label">Nome</FieldLabel>
            <Input
              id="vertical-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Lanchonete / Delivery"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="vertical-prompt">Treino (prompt base)</FieldLabel>
            <Textarea
              id="vertical-prompt"
              rows={8}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Você trabalha numa lanchonete, atendendo pedidos pelo WhatsApp..."
            />
          </Field>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={requiresFixedLocation}
              onCheckedChange={(checked) => setRequiresFixedLocation(checked === true)}
            />
            Negócio com endereço fixo (loja), não corridas de origem/destino livres
          </Label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={handleCreate} disabled={saving || !key.trim() || !label.trim() || !systemPrompt.trim()}>
            {saving ? "Criando..." : "Criar nicho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
