"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, TriangleAlert, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENTO_NICHES } from "@/config/segmento-niches";
import { GREETING_NAME_SOURCE_HELP } from "@/lib/notifications/greeting-name";
import { generateFunctionTemplateDraftAction } from "@/actions/admin/generate-function-template-draft";
import { checkSimilarFunctionTemplatesAction } from "@/actions/admin/check-similar-function-templates";
import { createFunctionTemplateAction } from "@/actions/admin/create-function-template";
import { updateFunctionTemplateAction } from "@/actions/admin/update-function-template";
import type {
  FunctionTemplate,
  SegmentoNiche,
  CustomGreetingStyle,
  CustomGreetingNameSource,
} from "@/generated/prisma/client";

interface DraftField {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
}

interface SimilarTemplate {
  key: string;
  label: string;
  reason: string;
}

const GREETING_STYLE_OPTIONS: { value: CustomGreetingStyle; label: string }[] = [
  { value: "FIXO", label: "Fixa (\"Olá, {nome}!\")" },
  { value: "HORARIO", label: "Por horário (\"Bom dia/Boa tarde/Boa noite, {nome}!\")" },
];

const GREETING_NAME_SOURCE_OPTIONS: { value: CustomGreetingNameSource; label: string }[] = [
  { value: "PERFIL_WHATSAPP", label: "Nome do perfil do WhatsApp" },
  { value: "CADASTRO", label: "Nome cadastrado (enviado pelo sistema externo)" },
];

function GreetingFields({
  style,
  nameSource,
  onStyleChange,
  onNameSourceChange,
}: {
  style: CustomGreetingStyle;
  nameSource: CustomGreetingNameSource;
  onStyleChange: (v: CustomGreetingStyle) => void;
  onNameSourceChange: (v: CustomGreetingNameSource) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs text-muted-foreground">Saudação</Label>
        <Select value={style} onValueChange={(v) => onStyleChange(v as CustomGreetingStyle)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GREETING_STYLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Nome usado na saudação</Label>
        <Select value={nameSource} onValueChange={(v) => onNameSourceChange(v as CustomGreetingNameSource)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GREETING_NAME_SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{GREETING_NAME_SOURCE_HELP}</p>
      </div>
    </div>
  );
}

/** Super Admin-only: catálogo global de "cards de função" (FunctionTemplate)
 * que qualquer tenant pode adotar ao montar as Funções de uma conexão, em
 * vez de descrever do zero pra IA toda vez — mesmo princípio de
 * BotVerticalsManager, aplicado a notificações. Antes de criar uma função
 * nova, checa contra o catálogo via IA e avisa se já existe uma parecida
 * (não bloqueia — quem decide se cria mesmo assim é o admin). */
export function FunctionTemplatesManager({ templates }: { templates: FunctionTemplate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funções globais</CardTitle>
        <CardDescription>
          Cards prontos pra qualquer tenant adotar ao montar as Funções de uma conexão. Antes de criar
          uma função nova, a gente checa se já existe uma parecida no catálogo e avisa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.map((template) => (
          <FunctionTemplateRow key={template.id} template={template} />
        ))}
        <NewFunctionTemplateDialog />
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

function DuplicateWarning({ duplicates }: { duplicates: SimilarTemplate[] }) {
  if (duplicates.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium text-foreground">Já existe uma função parecida</p>
        <ul className="mt-1 space-y-1 text-muted-foreground">
          {duplicates.map((d) => (
            <li key={d.key}>
              <span className="font-medium text-foreground">{d.label}</span> ({d.key}) — {d.reason}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-muted-foreground">Clique de novo pra criar mesmo assim.</p>
      </div>
    </div>
  );
}

function FunctionTemplateRow({ template }: { template: FunctionTemplate }) {
  const router = useRouter();
  const [label, setLabel] = useState(template.label);
  const [description, setDescription] = useState(template.description);
  const [fields, setFields] = useState<DraftField[]>(template.fields as unknown as DraftField[]);
  const [messageTemplate, setMessageTemplate] = useState(template.messageTemplate);
  const [requiresQr, setRequiresQr] = useState(template.requiresQr);
  const [niches, setNiches] = useState<SegmentoNiche[]>(template.niches);
  const [active, setActive] = useState(template.active);
  const [greetingStyle, setGreetingStyle] = useState<CustomGreetingStyle>(template.greetingStyle);
  const [greetingNameSource, setGreetingNameSource] = useState<CustomGreetingNameSource>(
    template.greetingNameSource
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function save(nextActive: boolean) {
    setSaving(true);
    setError(null);
    const result = await updateFunctionTemplateAction({
      id: template.id,
      label,
      description,
      fields,
      messageTemplate,
      requiresQr,
      niches,
      active: nextActive,
      sortOrder: template.sortOrder,
      greetingStyle,
      greetingNameSource,
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
        Chave: <code>{template.key}</code>
      </p>

      <Textarea
        className="mt-3"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="mt-3">
        <GreetingFields
          style={greetingStyle}
          nameSource={greetingNameSource}
          onStyleChange={setGreetingStyle}
          onNameSourceChange={setGreetingNameSource}
        />
      </div>

      <div className="mt-3 space-y-2">
        <Label className="text-xs text-muted-foreground">Campos</Label>
        {fields.map((field, i) => (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={field.key}
                onChange={(e) => updateField(i, { key: e.target.value })}
                className="w-1/2 font-mono text-xs"
              />
              <Input
                value={field.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="w-1/2"
              />
              <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
                <X className="size-4" />
              </Button>
            </div>
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={field.required !== false}
                onCheckedChange={(checked) => updateField(i, { required: checked === true })}
              />
              Obrigatório (desmarque se esse dado pode não vir em todo disparo)
            </Label>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFields((prev) => [...prev, { key: "", label: "" }])}
        >
          <Plus className="size-4" />
          Campo
        </Button>
      </div>

      <div className="mt-3">
        <Label className="text-xs text-muted-foreground">Texto da mensagem</Label>
        <Textarea
          rows={4}
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Use {"{{nome_empresa}}"} pra citar o nome do negócio — preenchido automaticamente.
        </p>
      </div>

      <Label className="mt-3 flex items-center gap-2 text-sm font-normal">
        <Checkbox checked={requiresQr} onCheckedChange={(c) => setRequiresQr(c === true)} />
        Essa mensagem inclui um QR code
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

const EMPTY_FORM = { title: "", description: "" };

function NewFunctionTemplateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<SimilarTemplate[]>([]);

  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [messageTemplate, setMessageTemplate] = useState("");
  const [requiresQr, setRequiresQr] = useState(false);
  const [niches, setNiches] = useState<SegmentoNiche[]>([]);
  const [greetingStyle, setGreetingStyle] = useState<CustomGreetingStyle>("FIXO");
  const [greetingNameSource, setGreetingNameSource] = useState<CustomGreetingNameSource>("PERFIL_WHATSAPP");

  function reset() {
    setForm(EMPTY_FORM);
    setDraftKey(null);
    setFields([]);
    setMessageTemplate("");
    setRequiresQr(false);
    setNiches([]);
    setGreetingStyle("FIXO");
    setGreetingNameSource("PERFIL_WHATSAPP");
    setDuplicates([]);
    setError(null);
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    const result = await generateFunctionTemplateDraftAction({
      title: form.title,
      description: form.description,
    });
    setGenerating(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setDraftKey(result.data.suggestedKey);
    setFields(result.data.fields);
    setMessageTemplate(result.data.messageTemplate);
    setGreetingStyle(result.data.greetingStyle);
    setGreetingNameSource(result.data.greetingNameSource);
  }

  function skipGeneration() {
    setDraftKey(form.title.trim() || "nova_funcao");
    setFields([{ key: "", label: "" }]);
    setMessageTemplate("");
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateClick() {
    if (duplicates.length === 0) {
      setChecking(true);
      setError(null);
      const checkResult = await checkSimilarFunctionTemplatesAction({
        label: form.title,
        description: form.description,
      });
      setChecking(false);
      if (checkResult.success && checkResult.data.duplicates.length > 0) {
        setDuplicates(checkResult.data.duplicates);
        return;
      }
    }
    await handleSave();
  }

  async function handleSave() {
    if (!draftKey) return;
    setError(null);
    setSaving(true);
    const result = await createFunctionTemplateAction({
      key: draftKey,
      label: form.title,
      description: form.description,
      fields,
      messageTemplate,
      requiresQr,
      niches,
      greetingStyle,
      greetingNameSource,
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
        Nova função
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova função global</DialogTitle>
          <DialogDescription>
            Vira um card que qualquer tenant pode adotar na tela de Funções.
          </DialogDescription>
        </DialogHeader>

        {draftKey === null ? (
          <div className="space-y-3">
            <Field>
              <FieldLabel htmlFor="ft-title">Título</FieldLabel>
              <Input
                id="ft-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="ex: Corrida concluída"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ft-description">Descrição</FieldLabel>
              <Textarea
                id="ft-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="ex: hora inicial, destino, tarifa, nome do motorista"
              />
              <FieldDescription>
                Usada pra IA montar campos + texto, e também pra checar duplicidade contra o catálogo.
              </FieldDescription>
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || !form.title.trim() || !form.description.trim()}
              >
                <Sparkles className="size-4" />
                {generating ? "Gerando…" : "Gerar com IA"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={skipGeneration}
                disabled={!form.title.trim()}
              >
                Montar na mão
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Identificador técnico</Label>
              <Input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} className="mt-1" />
            </div>

            <GreetingFields
              style={greetingStyle}
              nameSource={greetingNameSource}
              onStyleChange={setGreetingStyle}
              onNameSourceChange={setGreetingNameSource}
            />

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Campos</Label>
              {fields.map((field, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2">
                    <Input
                      value={field.key}
                      onChange={(e) => updateField(i, { key: e.target.value })}
                      placeholder="chave_tecnica"
                      className="w-1/2 font-mono text-xs"
                    />
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      placeholder="Rótulo"
                      className="w-1/2"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                  <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <Checkbox
                      checked={field.required !== false}
                      onCheckedChange={(checked) => updateField(i, { required: checked === true })}
                    />
                    Obrigatório (desmarque se esse dado pode não vir em todo disparo)
                  </Label>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFields((prev) => [...prev, { key: "", label: "" }])}
              >
                <Plus className="size-4" />
                Campo
              </Button>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Texto da mensagem</Label>
              <Textarea
                rows={5}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="mt-1"
                placeholder="Use {{chave}} pra cada campo."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use {"{{nome_empresa}}"} pra citar o nome do negócio — preenchido automaticamente.
              </p>
            </div>

            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={requiresQr} onCheckedChange={(c) => setRequiresQr(c === true)} />
              Essa mensagem inclui um QR code
            </Label>

            <div>
              <Label className="text-xs text-muted-foreground">Nichos sugeridos (vazio = genérico)</Label>
              <div className="mt-1">
                <NicheCheckboxes selected={niches} onChange={setNiches} />
              </div>
            </div>

            <DuplicateWarning duplicates={duplicates} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {draftKey !== null && (
          <DialogFooter className="mt-4">
            <Button
              onClick={handleCreateClick}
              disabled={
                saving ||
                checking ||
                !draftKey.trim() ||
                fields.length === 0 ||
                !messageTemplate.trim()
              }
            >
              {saving
                ? "Criando…"
                : checking
                  ? "Checando…"
                  : duplicates.length > 0
                    ? "Criar mesmo assim"
                    : "Criar função"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
