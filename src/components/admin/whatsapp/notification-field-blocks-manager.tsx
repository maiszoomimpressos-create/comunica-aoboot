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
import { SEGMENTO_NICHES } from "@/config/segmento-niches";
import { createNotificationFieldBlockAction } from "@/actions/admin/create-notification-field-block";
import { updateNotificationFieldBlockAction } from "@/actions/admin/update-notification-field-block";
import type { NotificationFieldBlock, SegmentoNiche } from "@/generated/prisma/client";

/** Super Admin-only: biblioteca de pedaços de campo prontos (ex: "valor",
 * "nome do motorista") que o tenant marca via checkbox ao montar uma função
 * personalizada, sem precisar descrever pra IA — ver
 * create-custom-notification-type-form.tsx e o comentário em
 * NotificationFieldBlock (schema.prisma) pro raciocínio completo. */
export function NotificationFieldBlocksManager({ blocks }: { blocks: NotificationFieldBlock[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedaços de campo</CardTitle>
        <CardDescription>
          Biblioteca de campos prontos (ex: &quot;valor&quot;, &quot;nome do motorista&quot;) que o tenant
          marca via checkbox ao montar uma função personalizada, sem precisar descrever nada pra IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.map((block) => (
          <NotificationFieldBlockRow key={block.id} block={block} />
        ))}
        <NewNotificationFieldBlockDialog />
      </CardContent>
    </Card>
  );
}

function NicheCheckboxes({
  selected,
  onChange,
}: {
  selected: SegmentoNiche[];
  onChange: (next: SegmentoNiche[]) => void;
}) {
  function toggle(key: SegmentoNiche, checked: boolean) {
    onChange(checked ? [...selected, key] : selected.filter((n) => n !== key));
  }
  return (
    <div className="flex flex-wrap gap-3">
      {SEGMENTO_NICHES.map((n) => (
        <Label key={n.key} className="flex items-center gap-1.5 text-sm font-normal">
          <Checkbox checked={selected.includes(n.key)} onCheckedChange={(c) => toggle(n.key, c === true)} />
          {n.label}
        </Label>
      ))}
    </div>
  );
}

function NotificationFieldBlockRow({ block }: { block: NotificationFieldBlock }) {
  const router = useRouter();
  const [label, setLabel] = useState(block.label);
  const [messageLine, setMessageLine] = useState(block.messageLine);
  const [description, setDescription] = useState(block.description ?? "");
  const [defaultRequired, setDefaultRequired] = useState(block.defaultRequired);
  const [niches, setNiches] = useState<SegmentoNiche[]>(block.niches);
  const [active, setActive] = useState(block.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextActive: boolean) {
    setSaving(true);
    setError(null);
    const result = await updateNotificationFieldBlockAction({
      id: block.id,
      key: block.key,
      label,
      messageLine,
      description: description.trim() || undefined,
      defaultRequired,
      niches,
      active: nextActive,
      sortOrder: block.sortOrder,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-xs font-medium" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ativo</span>
          <Switch
            checked={active}
            disabled={saving}
            onCheckedChange={(next) => {
              setActive(next);
              save(next);
            }}
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Chave: <code>{"{{" + block.key + "}}"}</code>
      </p>

      <div className="mt-3">
        <Label className="text-xs text-muted-foreground">Linha de mensagem</Label>
        <Input value={messageLine} onChange={(e) => setMessageLine(e.target.value)} className="mt-1" />
      </div>

      <div className="mt-3">
        <Label className="text-xs text-muted-foreground">Legenda opcional</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
      </div>

      <Label className="mt-3 flex items-center gap-2 text-sm font-normal">
        <Checkbox checked={defaultRequired} onCheckedChange={(c) => setDefaultRequired(c === true)} />
        Obrigatório por padrão ao ser marcado
      </Label>

      <div className="mt-3">
        <Label className="text-xs text-muted-foreground">Nichos sugeridos (vazio = genérico)</Label>
        <div className="mt-1">
          <NicheCheckboxes selected={niches} onChange={setNiches} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={() => save(active)}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

const EMPTY_FORM = { key: "", label: "", messageLine: "", description: "" };

function NewNotificationFieldBlockDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [defaultRequired, setDefaultRequired] = useState(true);
  const [niches, setNiches] = useState<SegmentoNiche[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm(EMPTY_FORM);
    setDefaultRequired(true);
    setNiches([]);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await createNotificationFieldBlockAction({
      key: form.key,
      label: form.label,
      messageLine: form.messageLine,
      description: form.description.trim() || undefined,
      defaultRequired,
      niches,
    });
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
        Novo pedaço
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pedaço de campo</DialogTitle>
          <DialogDescription>
            Vira uma opção de checkbox pro tenant marcar ao montar uma função personalizada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field>
            <FieldLabel htmlFor="fb-key">Chave técnica</FieldLabel>
            <Input
              id="fb-key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="ex: valor"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fb-label">Nome</FieldLabel>
            <Input
              id="fb-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="ex: Valor"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fb-line">Linha de mensagem</FieldLabel>
            <Input
              id="fb-line"
              value={form.messageLine}
              onChange={(e) => setForm((f) => ({ ...f, messageLine: e.target.value }))}
              placeholder="ex: 💰 Valor: {{valor}}"
            />
            <FieldDescription>Precisa referenciar a chave técnica acima entre chaves duplas.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fb-description">Legenda opcional</FieldLabel>
            <Textarea
              id="fb-description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>

          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={defaultRequired} onCheckedChange={(c) => setDefaultRequired(c === true)} />
            Obrigatório por padrão ao ser marcado
          </Label>

          <div>
            <Label className="text-xs text-muted-foreground">Nichos sugeridos (vazio = genérico)</Label>
            <div className="mt-1">
              <NicheCheckboxes selected={niches} onChange={setNiches} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="mt-4">
          <Button
            onClick={handleSave}
            disabled={saving || !form.key.trim() || !form.label.trim() || !form.messageLine.trim()}
          >
            {saving ? "Criando…" : "Criar pedaço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
