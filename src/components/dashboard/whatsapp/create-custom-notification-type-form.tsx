"use client";

import { useState, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Blocks, PenLine, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { generateCustomNotificationTypeDraftAction } from "@/actions/whatsapp/generate-custom-notification-type-draft";
import { suggestCustomNotificationTypeKeyAction } from "@/actions/whatsapp/suggest-custom-notification-type-key";
import { createCustomNotificationTypeAction } from "@/actions/whatsapp/create-custom-notification-type";
import type { CustomGreetingStyle, CustomGreetingNameSource, NotificationFieldBlock } from "@/generated/prisma/client";
import { CustomNotificationPreview, TemplatePlaceholderToolbar } from "./custom-notification-preview";
import { OrganizeTemplateLinesButton } from "./organize-template-lines-button";
import { AdvancedNotificationOptions } from "./advanced-notification-options";
import { CustomNotificationDraftPersistence, clearPersistedCustomNotificationDraft } from "./custom-notification-draft-persistence";
import { AiRequestText } from "./ai-request-text";
import { loadCustomNotificationDraft, type CustomNotificationDraftV1 } from "@/lib/notifications/custom-notification-draft-storage";
import {
  FIELD_VALUE_TYPES,
  FIELD_VALUE_TYPE_LABELS,
  inferValueType,
  insertAtCursor,
  moveItem,
  formatTemplateOneItemPerLine,
  type CustomNotificationField,
  type FieldValueType,
} from "@/lib/notifications/custom-message";
import { GREETING_NAME_SOURCE_HELP } from "@/lib/notifications/greeting-name";

type DraftField = CustomNotificationField;

const EMPTY_FORM = { title: "", description: "" };

const GREETING_STYLE_OPTIONS: { value: CustomGreetingStyle; label: string }[] = [
  { value: "FIXO", label: "Fixa (\"Olá, {nome}!\")" },
  { value: "HORARIO", label: "Por horário (\"Bom dia/Boa tarde/Boa noite, {nome}!\")" },
];

const GREETING_NAME_SOURCE_OPTIONS: { value: CustomGreetingNameSource; label: string }[] = [
  { value: "PERFIL_WHATSAPP", label: "Nome do perfil do WhatsApp" },
  { value: "CADASTRO", label: "Nome cadastrado (enviado pelo sistema externo)" },
];

/**
 * Tenant-facing: cria uma função personalizada em duas etapas — (1) título +
 * descrição livre do que a mensagem deve mandar, gerada com IA em campos +
 * texto; (2) revisão/edição de tudo (inclusive o identificador técnico
 * sugerido) antes de salvar. Ver generate-custom-notification-type-draft.ts
 * e create-custom-notification-type.ts.
 */
export function CreateCustomNotificationTypeForm({
  tenantSlug,
  connectionId,
  fieldBlocks,
}: {
  tenantSlug: string;
  connectionId: string;
  /** Biblioteca de pedaços prontos (ver NotificationFieldBlock) — já
   * ordenada por sortOrder, usada tal qual no checklist de "montar com
   * peças prontas". */
  fieldBlocks: NotificationFieldBlock[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"ia" | "pecas" | "manual">(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.mode ?? "ia");
  const [form, setForm] = useState(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.form ?? EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modo "montar com peças": quais pedaços foram marcados, nenhuma IA
  // envolvida — ver handleAssembleFromBlocks.
  const [selectedBlockKeys, setSelectedBlockKeys] = useState<Set<string>>(() => new Set(loadCustomNotificationDraft(tenantSlug, connectionId)?.selectedBlockKeys ?? []));
  const [assembling, setAssembling] = useState(false);

  // Modo "frase + campos simples": o tenant escreve a abertura com as
  // próprias palavras e nomeia os campos que quer (sem precisar que o
  // admin tenha cadastrado um pedaço antes, sem IA) — ver
  // handleAssembleFromManualFields. Cada campo marcado vira uma linha fixa
  // no final da mensagem, nessa ordem.
  const [openingPhrase, setOpeningPhrase] = useState(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.openingPhrase ?? "");
  const [manualFieldLabels, setManualFieldLabels] = useState<string[]>(() => {
    const labels = loadCustomNotificationDraft(tenantSlug, connectionId)?.manualFieldLabels;
    return labels && labels.length > 0 ? labels : [""];
  });

  // Preenchido só depois de gerar com IA (ou montar com peças) — a
  // existência disso é o que controla se mostramos a etapa de revisão.
  const [draftKey, setDraftKey] = useState<string | null>(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.draftKey ?? null);
  const [fields, setFields] = useState<DraftField[]>(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.fields ?? []);
  const [messageTemplate, setMessageTemplate] = useState(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.messageTemplate ?? "");
  const [requiresQr, setRequiresQr] = useState(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.requiresQr ?? false);
  const [greetingStyle, setGreetingStyle] = useState<CustomGreetingStyle>(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.greetingStyle ?? "FIXO");
  const [greetingNameSource, setGreetingNameSource] = useState<CustomGreetingNameSource>(() => loadCustomNotificationDraft(tenantSlug, connectionId)?.greetingNameSource ?? "PERFIL_WHATSAPP");

  const templateRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(token: string) {
    const el = templateRef.current;
    const start = el?.selectionStart ?? messageTemplate.length;
    const end = el?.selectionEnd ?? start;
    const next = insertAtCursor(messageTemplate, start, end, token);
    setMessageTemplate(next.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function handleTemplateDrop(event: DragEvent<HTMLTextAreaElement>) {
    const token = event.dataTransfer.getData("text/plain");
    if (!token.startsWith("{{") || !token.endsWith("}}")) return;
    event.preventDefault();
    insertToken(token);
  }

  function addFieldBlock(block: NotificationFieldBlock) {
    if (fields.some((f) => f.key === block.key)) return;
    setFields((prev) => [
      ...prev,
      {
        key: block.key,
        label: block.label,
        description: block.description ?? undefined,
        required: block.defaultRequired,
        valueType: inferValueType(block.key, block.label),
      },
    ]);
    const line = block.messageLine?.trim();
    if (line) {
      setMessageTemplate((prev) => (prev.trim() ? `${prev.trimEnd()}\n${line}` : line));
    }
  }


  const draftValue = {
    form,
    mode,
    draftKey,
    fields,
    messageTemplate,
    requiresQr,
    greetingStyle,
    greetingNameSource,
    selectedBlockKeys: Array.from(selectedBlockKeys),
    openingPhrase,
    manualFieldLabels,
  };

  function restorePersistedDraft(draft: CustomNotificationDraftV1) {
    setMode(draft.mode);
    setForm(draft.form);
    setSelectedBlockKeys(new Set(draft.selectedBlockKeys));
    setOpeningPhrase(draft.openingPhrase);
    setManualFieldLabels(draft.manualFieldLabels.length > 0 ? draft.manualFieldLabels : [""]);
    setDraftKey(draft.draftKey);
    setFields(draft.fields);
    setMessageTemplate(draft.messageTemplate);
    setRequiresQr(draft.requiresQr);
    setGreetingStyle(draft.greetingStyle);
    setGreetingNameSource(draft.greetingNameSource);
  }

  const draftPersistence = (
    <CustomNotificationDraftPersistence
      tenantSlug={tenantSlug}
      connectionId={connectionId}
      value={draftValue}
      onRestore={restorePersistedDraft}
    />
  );

  function resetAll() {
    setMode("ia");
    setForm(EMPTY_FORM);
    setSelectedBlockKeys(new Set());
    setOpeningPhrase("");
    setManualFieldLabels([""]);
    setDraftKey(null);
    setFields([]);
    setMessageTemplate("");
    setRequiresQr(false);
    setGreetingStyle("FIXO");
    setGreetingNameSource("PERFIL_WHATSAPP");
    setError(null);
    clearPersistedCustomNotificationDraft(tenantSlug, connectionId);
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    const result = await generateCustomNotificationTypeDraftAction(tenantSlug, {
      connectionId,
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

  function toggleBlock(key: string, checked: boolean) {
    setSelectedBlockKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Monta fields + messageTemplate direto dos pedaços marcados, sem
   * nenhuma chamada de IA — só pede um identificador técnico único (ver
   * suggest-custom-notification-type-key.ts) e cai na mesma tela de
   * revisão de sempre, onde o tenant ainda pode editar tudo. */
  async function handleAssembleFromBlocks() {
    setError(null);
    setAssembling(true);
    const keyResult = await suggestCustomNotificationTypeKeyAction(tenantSlug, {
      connectionId,
      title: form.title,
    });
    setAssembling(false);
    if (!keyResult.success) {
      setError(keyResult.error.message);
      return;
    }
    const selected = fieldBlocks.filter((b) => selectedBlockKeys.has(b.key));
    setDraftKey(keyResult.data.suggestedKey);
    setFields(
      selected.map((b) => ({
        key: b.key,
        label: b.label,
        description: b.description ?? undefined,
        required: b.defaultRequired,
        valueType: inferValueType(b.key, b.label),
      }))
    );
    setMessageTemplate(selected.map((b) => b.messageLine).join("\n"));
  }

  function updateManualFieldLabel(index: number, label: string) {
    setManualFieldLabels((prev) => prev.map((l, i) => (i === index ? label : l)));
  }

  function removeManualField(index: number) {
    setManualFieldLabels((prev) => prev.filter((_, i) => i !== index));
  }

  /** Monta fields + messageTemplate a partir da frase de abertura livre +
   * dos campos que o tenant nomeou na hora (sem precisar que o admin tenha
   * cadastrado um pedaço antes, sem IA) — cada campo vira uma linha fixa
   * "Rótulo: {{chave}}" no final, nessa ordem. Mesma etapa de revisão de
   * sempre depois de montado. */
  async function handleAssembleFromManualFields() {
    setError(null);
    setAssembling(true);
    const keyResult = await suggestCustomNotificationTypeKeyAction(tenantSlug, {
      connectionId,
      title: form.title,
    });
    setAssembling(false);
    if (!keyResult.success) {
      setError(keyResult.error.message);
      return;
    }
    const usedKeys = new Set<string>();
    const manualFields = manualFieldLabels
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .map((label) => {
        const base = slugify(label) || "campo";
        let key = base;
        let suffix = 2;
        while (usedKeys.has(key)) {
          key = `${base}_${suffix}`;
          suffix += 1;
        }
        usedKeys.add(key);
        return { key, label, required: true as const, valueType: inferValueType(key, label) };
      });
    setDraftKey(keyResult.data.suggestedKey);
    setFields(manualFields.map((f) => ({ key: f.key, label: f.label, required: true })));
    const lines = manualFields.map((f) => `${f.label}: {{${f.key}}}`);
    setMessageTemplate([openingPhrase.trim(), ...lines].filter(Boolean).join("\n"));
    setForm((f) => ({ ...f, description: openingPhrase.trim() }));
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function handleSave() {
    if (!draftKey) return;
    setError(null);
    setSaving(true);
    const result = await createCustomNotificationTypeAction(tenantSlug, {
      connectionId,
      key: draftKey,
      label: form.title,
      description: form.description,
      fields,
      messageTemplate,
      requiresQr,
      greetingStyle,
      greetingNameSource,
      aiDescription: mode === "ia" ? form.description : undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    clearPersistedCustomNotificationDraft(tenantSlug, connectionId);
    resetAll();
    router.refresh();
  }

  if (draftKey === null) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        {draftPersistence}
        <p className="text-sm font-medium text-foreground">Criar função personalizada</p>

        <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("ia")}
            className={cn(
              "flex-1 rounded px-2 py-1 font-medium",
              mode === "ia" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            Descrever com IA
          </button>
          <button
            type="button"
            onClick={() => setMode("pecas")}
            className={cn(
              "flex-1 rounded px-2 py-1 font-medium",
              mode === "pecas" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            Montar com peças prontas
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "flex-1 rounded px-2 py-1 font-medium",
              mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            Frase + campos simples
          </button>
        </div>

        <Input
          placeholder="Título (ex: Corrida concluída MAI Drive)"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />

        {mode === "ia" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Descreva o que a mensagem deve mandar pro cliente — a gente usa IA pra transformar isso em
              campos e num texto pronto pra você revisar.
            </p>
            <Textarea
              placeholder="Ex: hora inicial, destino, tarifa, nome do motorista"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating || !form.title.trim() || !form.description.trim()}
            >
              <Sparkles className="size-4" />
              {generating ? "Gerando…" : "Gerar com IA"}
            </Button>
          </>
        ) : mode === "pecas" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Marque os pedaços que essa função deve mandar — sem precisar descrever nada, nenhuma IA
              envolvida.
            </p>
            <Input
              placeholder="Descrição curta (aparece na lista de Funções)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            {fieldBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum pedaço cadastrado ainda — peça pro administrador da plataforma cadastrar alguns, ou
                use a aba &quot;Descrever com IA&quot;.
              </p>
            ) : (
              <div className="space-y-1">
                {fieldBlocks.map((block) => (
                  <Label key={block.id} className="flex items-start gap-2 text-sm font-normal">
                    <Checkbox
                      checked={selectedBlockKeys.has(block.key)}
                      onCheckedChange={(checked) => toggleBlock(block.key, checked === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-foreground">{block.label}</span>
                      {block.description && (
                        <span className="block text-xs text-muted-foreground">{block.description}</span>
                      )}
                    </span>
                  </Label>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAssembleFromBlocks}
              disabled={
                assembling || !form.title.trim() || !form.description.trim() || selectedBlockKeys.size === 0
              }
            >
              <Blocks className="size-4" />
              {assembling ? "Montando…" : "Montar"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Escreva a frase de abertura com suas palavras e liste os campos que a mensagem precisa —
              cada um vira uma linha no final, sem precisar de IA nem de pedaços cadastrados antes.
            </p>
            <Textarea
              placeholder="Ex: Seu pedido foi confirmado!"
              rows={2}
              value={openingPhrase}
              onChange={(e) => setOpeningPhrase(e.target.value)}
            />
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Campos (cada um vira uma linha no final)</Label>
              {manualFieldLabels.map((label, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={label}
                    onChange={(e) => updateManualFieldLabel(i, e.target.value)}
                    placeholder="Ex: Nome do produto"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeManualField(i)}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManualFieldLabels((prev) => [...prev, ""])}
              >
                + Campo
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAssembleFromManualFields}
              disabled={assembling || !form.title.trim() || !openingPhrase.trim()}
            >
              <PenLine className="size-4" />
              {assembling ? "Montando…" : "Montar"}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 rounded-lg border border-border p-4">
      {draftPersistence}
      {mode === "ia" && <AiRequestText text={form.description} />}
      <p className="text-sm font-medium text-foreground">Revise antes de salvar</p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]">
      <div className="min-w-0 space-y-4">
      <div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Texto da mensagem</Label>
          <OrganizeTemplateLinesButton
            onClick={() => setMessageTemplate(formatTemplateOneItemPerLine(messageTemplate))}
            disabled={!messageTemplate.trim()}
          />
        </div>
        <Textarea
          ref={templateRef}
          rows={12}
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleTemplateDrop}
          className="mt-1 min-h-40 w-full whitespace-pre-wrap"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Use {"{{nome_empresa}}"} pra citar o nome do negócio — é preenchido automaticamente, não precisa
          declarar como campo.
        </p>
        <TemplatePlaceholderToolbar
          fields={fields}
          fieldBlocks={fieldBlocks}
          onInsert={insertToken}
          onAddBlock={addFieldBlock}
        />
      </div>


      <AdvancedNotificationOptions error={error}>

      <div>
        <Label className="text-xs text-muted-foreground">Identificador técnico (o que o sistema de fora manda em &quot;type&quot;)</Label>
        <Input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} className="mt-1" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Saudação</Label>
          <Select value={greetingStyle} onValueChange={(v) => setGreetingStyle(v as CustomGreetingStyle)}>
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
          <Select
            value={greetingNameSource}
            onValueChange={(v) => setGreetingNameSource(v as CustomGreetingNameSource)}
          >
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

      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Campos</Label>
        {fields.map((field, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border/70 p-3">
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(9rem,12rem)_auto]">
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">Identificador</Label>
                <Input
                  value={field.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  className="mt-1 w-full font-mono text-xs"
                />
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">Rótulo</Label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  className="mt-1 w-full"
                />
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select
                  value={field.valueType ?? inferValueType(field.key, field.label)}
                  onValueChange={(v) => updateField(i, { valueType: v as FieldValueType })}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_VALUE_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {FIELD_VALUE_TYPE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setFields((prev) => moveItem(prev, i, -1))} disabled={i === 0}>
                  <ChevronUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setFields((prev) => moveItem(prev, i, 1))} disabled={i === fields.length - 1}>
                  <ChevronDown className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <Input
              value={field.description ?? ""}
              onChange={(e) => updateField(i, { description: e.target.value })}
              placeholder="Legenda opcional"
              className="text-xs text-muted-foreground"
            />
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={field.required !== false}
                onCheckedChange={(checked) => updateField(i, { required: checked === true })}
              />
              Obrigatorio (desmarque se esse dado pode nao vir em todo disparo — a linha some da mensagem quando faltar)
            </Label>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setFields((prev) => [...prev, { key: "", label: "", required: true, valueType: "texto" }])}>
          + Campo
        </Button>
      </div>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox checked={requiresQr} onCheckedChange={(checked) => setRequiresQr(checked === true)} />
        Essa mensagem inclui um QR code (ex: ingresso, comprovante)
      </Label>
      </AdvancedNotificationOptions>


      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "Salvar função"}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetAll} disabled={saving}>
          Cancelar
        </Button>
      </div>
      </div>
      <div className="min-w-0 lg:sticky lg:top-4">
      <CustomNotificationPreview
        typeKey={draftKey}
        fields={fields}
        messageTemplate={messageTemplate}
        greetingStyle={greetingStyle}
        greetingNameSource={greetingNameSource}
        requiresQr={requiresQr}
        tenantSlug={tenantSlug}
        connectionId={connectionId}
      />
      </div>
      </div>
    </div>
  );
}
