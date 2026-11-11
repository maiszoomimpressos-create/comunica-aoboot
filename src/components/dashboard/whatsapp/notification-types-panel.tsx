"use client";

import { useEffect, useState, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X, ChevronUp, ChevronDown, ChevronRight, Copy, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_TYPES,
  getNotificationTypesForNiches,
  type NotificationTypeDef,
} from "@/config/whatsapp-notification-types";
import { getSegmentoNicheLabel } from "@/config/segmento-niches";
import { getServiceLabel } from "@/config/whatsapp-services";
import type {
  SegmentoNiche,
  CustomGreetingStyle,
  CustomGreetingNameSource,
  NotificationFieldBlock,
} from "@/generated/prisma/client";
import type { CustomNotificationField } from "@/repositories/custom-notification-type.repository";
import { CustomNotificationPreview, TemplatePlaceholderToolbar } from "./custom-notification-preview";
import { OrganizeTemplateLinesButton } from "./organize-template-lines-button";
import { AdvancedNotificationOptions } from "./advanced-notification-options";
import { CustomNotificationTestSend } from "./custom-notification-test-send";
import { CustomNotificationDeveloperInstructions } from "./custom-notification-developer-instructions";
import {
  FIELD_VALUE_TYPES,
  FIELD_VALUE_TYPE_LABELS,
  inferValueType,
  insertAtCursor,
  moveItem,
  formatTemplateOneItemPerLine,
  type FieldValueType,
} from "@/lib/notifications/custom-message";
import { GREETING_NAME_SOURCE_HELP } from "@/lib/notifications/greeting-name";
import { updateEnabledNotificationTypesAction } from "@/actions/whatsapp/update-enabled-notification-types";
import { updateCustomNotificationTypeAction } from "@/actions/whatsapp/update-custom-notification-type";
import { createCustomNotificationTypeAction } from "@/actions/whatsapp/create-custom-notification-type";
import { deleteCustomNotificationTypeAction } from "@/actions/whatsapp/delete-custom-notification-type";
import { generateCustomNotificationTypeDraftAction } from "@/actions/whatsapp/generate-custom-notification-type-draft";
import { CreateCustomNotificationTypeForm } from "./create-custom-notification-type-form";
import { resolveAiDescription } from "./ai-request-text";
import { CustomFunctionRequestHistory } from "./custom-function-ai-history";
import { CustomFunctionAiPatchPanel } from "./custom-function-ai-patch-panel";
import type { CustomFunctionAiHistoryEntry } from "@/lib/notifications/custom-function-history";
import { groupCustomTypesByKind } from "@/lib/notifications/custom-function-kind";

// Agrupa o catálogo (já filtrado por nicho, ver groupByService abaixo) por
// serviceKey (ex: "Confirmação de compra / ingresso", "Código de
// verificação (2FA)") só pra organizar visualmente — a validação de verdade
// continua sendo por tipo individual, não por grupo.
function groupByService(types: NotificationTypeDef[]) {
  return Object.entries(
    types.reduce<Record<string, NotificationTypeDef[]>>((acc, type) => {
      (acc[type.serviceKey] ??= []).push(type);
      return acc;
    }, {})
  );
}

/** Forma mínima comum pro painel de detalhe — tipo fixo e função
 * personalizada entram nela do mesmo jeito, sem o painel precisar saber a
 * origem. */
interface DisplayType {
  key: string;
  label: string;
  description: string;
  requiresQr: boolean;
  requiredDetailKeys: string[];
}

export interface CustomNotificationTypeSummary {
  id: string;
  key: string;
  label: string;
  description: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
  requiresQr: boolean;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  aiDescription?: string | null;
  history?: CustomFunctionAiHistoryEntry[];
  createdAt?: string | Date;
}

const GREETING_STYLE_OPTIONS: { value: CustomGreetingStyle; label: string }[] = [
  { value: "FIXO", label: "Fixa (\"Olá, {nome}!\")" },
  { value: "HORARIO", label: "Por horário (\"Bom dia/Boa tarde/Boa noite, {nome}!\")" },
];

const GREETING_NAME_SOURCE_OPTIONS: { value: CustomGreetingNameSource; label: string }[] = [
  { value: "PERFIL_WHATSAPP", label: "Nome do perfil do WhatsApp" },
  { value: "CADASTRO", label: "Nome cadastrado (enviado pelo sistema externo)" },
];

function nextCopyKey(baseKey: string, taken: Set<string>): string {
  let candidate = `${baseKey}_copia`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${baseKey}_copia_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Monta o corpo de exemplo do POST pra esse tipo — mesmos campos de
 * whatsapp-api-docs.tsx, só que já preenchido com os campos certos do tipo
 * selecionado, pra quem for integrar copiar e adaptar. */
function buildExamplePayload(type: DisplayType): string {
  const payload: Record<string, unknown> = {
    to: "5511999999999",
    type: type.key,
    recipientName: "Nome do cliente",
  };
  if (type.requiredDetailKeys.length > 0) {
    payload.details = Object.fromEntries(type.requiredDetailKeys.map((key) => [key, `<${key}>`]));
  }
  if (type.requiresQr) {
    payload.qrData = "<texto ou código que vira QR code>";
  }
  return JSON.stringify(payload, null, 2);
}

/**
 * Tenant-facing: escolhe, por conexão, quais tipos de notificação (catálogo
 * fixo + funções personalizadas) a chave de API pode disparar via
 * POST /api/v1/whatsapp/purchase-confirmation. Um card por conexão na
 * página "Funções" (modulos/whatsapp/funcoes) — página dedicada em vez de
 * diálogo, pra ficar visível no menu em vez de escondido num botão do card
 * de conexão. Lista à esquerda (só nome + checkbox) e painel de detalhe à
 * direita (descrição, campos obrigatórios, exemplo de chamada) — clicar
 * numa linha troca o que aparece no painel, sem precisar abrir nada.
 */
export function NotificationTypesPanel({
  tenantSlug,
  connectionId,
  connectionName,
  phoneNumber,
  defaultTypes,
  niches,
  customTypes,
  fieldBlocks,
}: {
  tenantSlug: string;
  connectionId: string;
  connectionName: string;
  phoneNumber: string;
  defaultTypes: string[];
  /** Nicho(s) declarados pelos Segmentos desta conexão (ver modulos/whatsapp/segmentos)
   * — usado só pra filtrar o que aparece aqui, nunca pra bloquear o envio. */
  niches: string[];
  customTypes: CustomNotificationTypeSummary[];
  /** Biblioteca de pedaços de campo prontos (ver NotificationFieldBlock) —
   * passada direto pro form de criação, pro checklist "montar com peças
   * prontas". */
  fieldBlocks: NotificationFieldBlock[];
}) {
  const router = useRouter();
  const [types, setTypes] = useState<string[]>(defaultTypes);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomNotificationTypeSummary | null>(null);
  const [duplicatingCustom, setDuplicatingCustom] = useState<CustomNotificationTypeSummary | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [aiPatchTarget, setAiPatchTarget] = useState<{ id: string; mode: "adicionar" | "editar" } | null>(null);
  // O formulário de criação lê o rascunho do sessionStorage no primeiro render;
  // só monta depois da hidratação pra o HTML do servidor e do navegador baterem.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Cada função salva começa recolhida (só o rótulo); clicar no rótulo expande/recolhe.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Narrowed by niche quando a conexão tem Segmento(s) — mas nunca esconde
  // um tipo já habilitado antes (pode ter sido ligado num nicho diferente
  // do atual, ou antes de o Segmento existir), senão salvar de novo some com ele.
  const nicheFiltered = getNotificationTypesForNiches(niches as SegmentoNiche[]);
  const visibleTypes =
    showAllTypes || niches.length === 0
      ? NOTIFICATION_TYPES
      : NOTIFICATION_TYPES.filter(
          (t) => nicheFiltered.includes(t) || types.includes(t.key)
        );
  const groupedTypes = groupByService(visibleTypes);
  const hiddenCount = NOTIFICATION_TYPES.length - visibleTypes.length;

  const displayCustomTypes: DisplayType[] = customTypes.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    requiresQr: c.requiresQr,
    requiredDetailKeys: c.fields.map((f) => f.key),
  }));
  const selectedType =
    NOTIFICATION_TYPES.find((t) => t.key === selectedKey) ??
    displayCustomTypes.find((t) => t.key === selectedKey) ??
    null;

  function toggle(key: string, checked: boolean) {
    setSaved(false);
    setTypes((prev) => (checked ? [...prev, key] : prev.filter((t) => t !== key)));
  }

  async function handleSave() {
    setSaving(true);
    setServerError(null);
    const result = await updateEnabledNotificationTypesAction(tenantSlug, { connectionId, types });
    setSaving(false);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function startDuplicate(type: CustomNotificationTypeSummary) {
    const taken = new Set([
      ...NOTIFICATION_TYPES.map((t) => t.key),
      ...customTypes.map((c) => c.key),
    ]);
    setEditingCustom(null);
    setAiPatchTarget(null);
    setDuplicatingCustom({
      ...type,
      key: nextCopyKey(type.key, taken),
      label: type.label.includes("(cópia)") ? type.label : `${type.label} (cópia)`,
    });
  }

  async function handleDelete(type: CustomNotificationTypeSummary) {
    const confirmed = window.confirm(
      `Excluir a função "${type.label}"? Ela some desta lista e não poderá mais ser disparada, mas o registro permanece no banco.`
    );
    if (!confirmed) return;
    setDeletingKey(type.key);
    setServerError(null);
    const result = await deleteCustomNotificationTypeAction(tenantSlug, { connectionId, key: type.key });
    setDeletingKey(null);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setTypes((prev) => prev.filter((item) => item !== type.key));
    if (selectedKey === type.key) setSelectedKey(null);
    if (editingCustom?.key === type.key) setEditingCustom(null);
    router.refresh();
  }

  const editorOpen = editingCustom !== null || duplicatingCustom !== null;

  return (
    <Card className="p-6">
      <div>
        <h3 className="font-medium">{connectionName}</h3>
        <p className="text-sm text-muted-foreground">{phoneNumber}</p>
      </div>

      {niches.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Mostrando funções de{" "}
            {niches.map((n) => getSegmentoNicheLabel(n as SegmentoNiche)).join(", ")}
            {hiddenCount > 0 && !showAllTypes && ` (${hiddenCount} escondidas de outros nichos)`}
          </span>
          {!showAllTypes && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllTypes(true)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mostrar todas
            </button>
          )}
          {showAllTypes && (
            <button
              type="button"
              onClick={() => setShowAllTypes(false)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mostrar só do nicho
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          {groupedTypes.map(([serviceKey, typesInGroup]) => (
            <div key={serviceKey} className="space-y-1">
              <p className="text-sm font-medium text-foreground">{getServiceLabel(serviceKey)}</p>
              <div className="space-y-0.5">
                {typesInGroup.map((type) => (
                  <div
                    key={type.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedKey(type.key)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedKey(type.key)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50",
                      selectedKey === type.key && "bg-muted"
                    )}
                  >
                    <Checkbox
                      checked={types.includes(type.key)}
                      onCheckedChange={(checked) => toggle(type.key, checked === true)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-foreground">{type.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          {selectedType ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{selectedType.label}</p>
                  <code className="text-xs text-muted-foreground">{selectedType.key}</code>
                </div>
                {(() => {
                  const custom = customTypes.find((c) => c.key === selectedType.key);
                  if (!custom) return null;
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDuplicatingCustom(null);
                        setEditingCustom(custom);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  );
                })()}
              </div>
              <p className="text-muted-foreground">{selectedType.description}</p>
              {selectedType.requiredDetailKeys.length > 0 && (
                <div>
                  <p className="text-foreground">Campos que o sistema de fora precisa mandar:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedType.requiredDetailKeys.map((key) => (
                      <code key={key} className="rounded bg-background px-1.5 py-0.5 text-xs">
                        {key}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {selectedType.requiresQr && (
                <p className="text-muted-foreground">
                  Exige <code className="text-xs text-foreground">qrData</code> — vira QR code na mensagem.
                </p>
              )}
              <div>
                <p className="text-foreground">
                  Exemplo de chamada (<code className="text-xs">POST /api/v1/whatsapp/purchase-confirmation</code>):
                </p>
                <pre className="mt-1 overflow-x-auto rounded-md bg-background p-2 text-xs text-foreground">
                  {buildExamplePayload(selectedType)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clique num tipo ao lado pra ver a descrição, os campos obrigatórios e um exemplo de chamada
              pronto pra levar pro time que vai integrar.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <div>
          <h4 className="font-medium">Funções personalizadas desta conexão</h4>
          <p className="text-sm text-muted-foreground">
            Funções que você salvou nesta conexão. Edite, use como base para outra ou exclua — a exclusão
            esconde da lista e do envio, mas o registro permanece no banco.
          </p>
        </div>
        {customTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma função personalizada salva ainda.</p>
        ) : (
          <div className="space-y-4">
            {groupCustomTypesByKind(customTypes).map((group) => (
              <section key={group.kind.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tipo de função</p>
                    <h5 className="text-base font-semibold text-foreground">{group.kind.label}</h5>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {group.items.length === 1 ? "1 função" : group.items.length + " funções"}
                  </span>
                </header>
                <div className="divide-y divide-border">
                  {group.items.map((type) => (
                    <div
                      key={type.id}
                      className={cn(selectedKey === type.key && "bg-muted/50")}
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Checkbox
                          checked={types.includes(type.key)}
                          onCheckedChange={(checked) => toggle(type.key, checked === true)}
                          aria-label={"Habilitar " + type.label + " nesta conexão"}
                        />
                        <button
                          type="button"
                          id={"custom-fn-trigger-" + type.id}
                          aria-expanded={expandedIds.has(type.id)}
                          aria-controls={"custom-fn-panel-" + type.id}
                          onClick={() => {
                            toggleExpanded(type.id);
                            setSelectedKey(type.key);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform",
                              expandedIds.has(type.id) && "rotate-90"
                            )}
                          />
                          <span className="truncate text-sm font-medium text-foreground">{type.label}</span>
                        </button>
                      </div>
                      {expandedIds.has(type.id) && (
                        <div
                          id={"custom-fn-panel-" + type.id}
                          role="region"
                          aria-labelledby={"custom-fn-trigger-" + type.id}
                          className="space-y-3 border-t border-border/60 bg-muted/20 px-4 pb-4 pt-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="text-xs text-muted-foreground">{type.key}</code>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDuplicatingCustom(null);
                                  setEditingCustom(null);
                                  setAiPatchTarget({ id: type.id, mode: "adicionar" });
                                }}
                              >
                                <Plus className="size-3.5" />
                                Adicionar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setDuplicatingCustom(null);
                                  setEditingCustom(null);
                                  setAiPatchTarget({ id: type.id, mode: "editar" });
                                }}
                              >
                                <Sparkles className="size-3.5" />
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAiPatchTarget(null);
                                  setDuplicatingCustom(null);
                                  setEditingCustom(type);
                                }}
                              >
                                <Pencil className="size-3.5" />
                                Edição manual
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => startDuplicate(type)}>
                                <Copy className="size-3.5" />
                                Duplicar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(type)}
                                disabled={deletingKey === type.key}
                              >
                                <Trash2 className="size-3.5" />
                                {deletingKey === type.key ? "Excluindo…" : "Excluir"}
                              </Button>
                            </div>
                          </div>
                          {aiPatchTarget?.id === type.id && (
                            <CustomFunctionAiPatchPanel
                              tenantSlug={tenantSlug}
                              connectionId={connectionId}
                              type={type}
                              mode={aiPatchTarget.mode}
                              onClose={() => setAiPatchTarget(null)}
                              onApplied={() => {
                                setAiPatchTarget(null);
                                router.refresh();
                              }}
                              onOpenManualEdit={
                                aiPatchTarget.mode === "editar"
                                  ? () => {
                                      setAiPatchTarget(null);
                                      setDuplicatingCustom(null);
                                      setEditingCustom(type);
                                    }
                                  : undefined
                              }
                            />
                          )}
                          <CustomFunctionRequestHistory
                            creationText={resolveAiDescription(type.aiDescription, type.description)}
                            createdAt={type.createdAt}
                            history={type.history}
                          />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Texto da mensagem</p>
                            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm text-foreground">
                              {type.messageTemplate}
                            </pre>
                          </div>
                          {type.fields.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Campos</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {type.fields.map((field) => (
                                  <span
                                    key={field.key}
                                    className="rounded bg-background px-1.5 py-0.5 text-xs text-foreground ring-1 ring-border"
                                  >
                                    {field.label || field.key}
                                    {field.required === false && <span className="text-muted-foreground"> (opcional)</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <CustomNotificationTestSend
                            id={"saved-" + type.id}
                            tenantSlug={tenantSlug}
                            connectionId={connectionId}
                            messageTemplate={type.messageTemplate}
                            fields={type.fields}
                            greetingStyle={type.greetingStyle}
                            greetingNameSource={type.greetingNameSource}
                          />
                          <CustomNotificationDeveloperInstructions
                            typeKey={type.key}
                            typeLabel={type.label}
                            fields={type.fields}
                            requiresQr={type.requiresQr}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="mt-6 w-full min-w-0">
          <EditCustomTypeForm
            tenantSlug={tenantSlug}
            connectionId={connectionId}
            type={editingCustom ?? duplicatingCustom!}
            mode={editingCustom ? "edit" : "duplicate"}
            fieldBlocks={fieldBlocks}
            onCancel={() => {
              setEditingCustom(null);
              setDuplicatingCustom(null);
            }}
            onSaved={() => {
              setEditingCustom(null);
              setDuplicatingCustom(null);
              router.refresh();
            }}
          />
        </div>
      )}

      {/* Kept mounted (only hidden) so the unsaved AI draft in React state + sessionStorage is not reset. */}
      <div className={cn("mt-6 w-full min-w-0", editorOpen && "hidden")}>
        {mounted && (
          <CreateCustomNotificationTypeForm
            tenantSlug={tenantSlug}
            connectionId={connectionId}
            fieldBlocks={fieldBlocks}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
        {saved && !serverError && <p className="text-sm text-muted-foreground">Salvo.</p>}
      </div>
    </Card>
  );
}

/** Formulário de edição (ou cópia) de uma função personalizada já salva —
 * mesma validação de placeholder que a criação (ver
 * updateCustomNotificationTypeForConnection / createCustomNotificationTypeForConnection),
 * só que no modo edição o `key` fica travado. O layout acompanha a revisão
 * da criação: campos à esquerda, prévia à direita, na largura da página. */
function EditCustomTypeForm({
  tenantSlug,
  connectionId,
  type,
  mode,
  fieldBlocks,
  onCancel,
  onSaved,
}: {
  tenantSlug: string;
  connectionId: string;
  type: CustomNotificationTypeSummary;
  mode: "edit" | "duplicate";
  fieldBlocks: NotificationFieldBlock[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isDuplicate = mode === "duplicate";
  const [draftKey, setDraftKey] = useState(type.key);
  const [label, setLabel] = useState(type.label);
  const [description, setDescription] = useState(type.description);
  const [fields, setFields] = useState<CustomNotificationField[]>(type.fields);
  const [messageTemplate, setMessageTemplate] = useState(type.messageTemplate);
  const [requiresQr, setRequiresQr] = useState(type.requiresQr);
  const [greetingStyle, setGreetingStyle] = useState<CustomGreetingStyle>(type.greetingStyle);
  const [greetingNameSource, setGreetingNameSource] = useState<CustomGreetingNameSource>(type.greetingNameSource);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const [aiDescription, setAiDescription] = useState(() =>
    resolveAiDescription(type.aiDescription, type.description)
  );
  const [regenerating, setRegenerating] = useState(false);

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

  function updateField(index: number, patch: Partial<CustomNotificationField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleRegenerateFromAiText() {
    setError(null);
    setRegenerating(true);
    const result = await generateCustomNotificationTypeDraftAction(tenantSlug, {
      connectionId,
      title: label,
      description: aiDescription,
    });
    setRegenerating(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setFields(result.data.fields);
    setMessageTemplate(result.data.messageTemplate);
    setGreetingStyle(result.data.greetingStyle);
    setGreetingNameSource(result.data.greetingNameSource);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const payload = {
      connectionId,
      key: isDuplicate ? draftKey : type.key,
      label,
      description,
      fields,
      messageTemplate,
      requiresQr,
      greetingStyle,
      greetingNameSource,
      aiDescription: aiDescription.trim() || undefined,
    };
    const result = isDuplicate
      ? await createCustomNotificationTypeAction(tenantSlug, payload)
      : await updateCustomNotificationTypeAction(tenantSlug, payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="w-full min-w-0 space-y-4 rounded-lg border border-border p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {isDuplicate ? "Aproveitar em outra (cópia)" : "Editar função"}
        </p>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
        <Label className="text-sm font-medium text-foreground">O que você pediu para a IA</Label>
        <Textarea
          rows={4}
          value={aiDescription}
          onChange={(e) => setAiDescription(e.target.value)}
          className="whitespace-pre-wrap"
          placeholder="O texto que foi enviado para a IA aparecer aqui."
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRegenerateFromAiText}
          disabled={regenerating || saving || !aiDescription.trim()}
        >
          <Sparkles className="size-4" />
          {regenerating ? "Gerando…" : "Gerar de novo com IA a partir deste texto"}
        </Button>
      </div>

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
              placeholder="Use {{chave}} pra cada campo declarado acima."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use {"{{nome_empresa}}"} pra citar o nome do negócio — preenchido automaticamente.
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
            <Label className="text-xs text-muted-foreground">
              Identificador técnico (o que o sistema de fora manda em &quot;type&quot;)
            </Label>
            {isDuplicate ? (
              <Input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} className="mt-1" />
            ) : (
              <code className="mt-1 block text-xs text-muted-foreground">{type.key}</code>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
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
                  Obrigatório (desmarque se esse dado pode não vir em todo disparo)
                </Label>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFields((prev) => [...prev, { key: "", label: "", required: true, valueType: "texto" }])}>
              + Campo
            </Button>
          </div>

          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={requiresQr} onCheckedChange={(c) => setRequiresQr(c === true)} />
            Essa mensagem inclui um QR code
          </Label>
          </AdvancedNotificationOptions>


          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !messageTemplate.trim()}>
              {saving ? "Salvando…" : isDuplicate ? "Salvar cópia" : "Salvar edição"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <CustomNotificationPreview
            typeKey={isDuplicate ? draftKey : type.key}
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
