"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateCustomNotificationAdditionAction } from "@/actions/whatsapp/generate-custom-notification-addition";
import { generateCustomNotificationEditAction } from "@/actions/whatsapp/generate-custom-notification-edit";
import { applyCustomNotificationAiPatchAction } from "@/actions/whatsapp/apply-custom-notification-ai-patch";
import type { AiPatchPreviewResult } from "@/services/custom-notification-ai-patch.service";
import type { CustomNotificationTypeSummary } from "./notification-types-panel";

export function CustomFunctionAiPatchPanel({
  tenantSlug,
  connectionId,
  type,
  mode,
  onClose,
  onApplied,
  onOpenManualEdit,
}: {
  tenantSlug: string;
  connectionId: string;
  type: CustomNotificationTypeSummary;
  mode: "adicionar" | "editar";
  onClose: () => void;
  onApplied: () => void;
  onOpenManualEdit?: () => void;
}) {
  const isAdd = mode === "adicionar";
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiPatchPreviewResult | null>(null);

  async function handlePreview() {
    setError(null);
    setResult(null);
    setLoading(true);
    const response = isAdd
      ? await generateCustomNotificationAdditionAction(tenantSlug, {
          connectionId,
          key: type.key,
          prompt,
        })
      : await generateCustomNotificationEditAction(tenantSlug, {
          connectionId,
          key: type.key,
          prompt,
        });
    setLoading(false);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setResult(response.data);
  }

  async function handleApply() {
    if (!result) return;
    setError(null);
    setApplying(true);
    const response = await applyCustomNotificationAiPatchAction(tenantSlug, {
      connectionId,
      key: type.key,
      prompt: result.prompt,
      mode: result.mode,
      addition: result.addition,
      editPatch: result.editPatch,
    });
    setApplying(false);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    onApplied();
  }

  function handleDiscardPreview() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{isAdd ? "Acrescentar com IA" : "Editar trecho com IA"}</p>
          <p className="text-xs text-muted-foreground">
            {isAdd
              ? "Descreva só o que quer incluir. A prévia mostra o acréscimo e o lugar; nada é salvo antes de você confirmar."
              : "Descreva a mudança. A IA altera só o trecho pedido. Você revisa o antes e o depois e confirma."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          {isAdd ? "O que você quer acrescentar" : "O que você quer mudar"}
        </Label>
        <Textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={isAdd ? "Ex.: incluir saldo restante" : "Ex.: trocar o rótulo Pagamento por Forma de pagamento"}
          className="whitespace-pre-wrap"
          disabled={loading || applying}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handlePreview}
            disabled={loading || applying || !prompt.trim()}
          >
            <Sparkles className="size-4" />
            {loading ? "Gerando prévia…" : "Gerar prévia"}
          </Button>
          {mode === "editar" && onOpenManualEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenManualEdit} disabled={loading || applying}>
              Abrir edição manual
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Prévia — nada foi salvo ainda
            </p>
            {result.positionNote ? <p className="mt-1 text-xs text-foreground">{result.positionNote}</p> : null}
          </div>

          {result.preview.insertAfterLabel && result.preview.addedLines.length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground">Será inserido depois de</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
                {result.preview.insertAfterLabel}
              </pre>
            </div>
          ) : null}

          {result.preview.addedLines.length > 0 ? (
            <DiffBlock title="Linhas que entram" tone="add" lines={result.preview.addedLines.map((line) => `+ ${line}`)} />
          ) : null}

          {result.preview.lineReplacements.map((replacement, index) => (
            <div key={`${replacement.from}-${index}`} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Linha alterada</p>
              <DiffBlock tone="remove" lines={[`− ${replacement.from}`]} />
              <DiffBlock tone="add" lines={[`+ ${replacement.to}`]} />
            </div>
          ))}

          {result.preview.deletedLines.length > 0 ? (
            <DiffBlock
              title="Linhas que saem"
              tone="remove"
              lines={result.preview.deletedLines.map((line) => `− ${line}`)}
            />
          ) : null}

          {result.preview.addedFields.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Campos novos</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {result.preview.addedFields.map((field) => (
                  <li
                    key={field.key}
                    className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-300"
                  >
                    {field.label} <code className="text-[10px]">{field.key}</code>
                    {field.required === false ? <span> (opcional)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.preview.fieldUpdates.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Campos alterados</p>
              {result.preview.fieldUpdates.map((update) => (
                <p key={update.key} className="text-xs text-foreground">
                  <code>{update.key}</code>: {update.before.label}
                  {update.before.label !== update.after.label ? ` → ${update.after.label}` : ""}
                  {update.before.required !== update.after.required
                    ? update.after.required
                      ? " (passa a obrigatório)"
                      : " (passa a opcional)"
                    : ""}
                </p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={handleApply} disabled={applying || loading}>
              {applying ? "Aplicando…" : "Aplicar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleDiscardPreview} disabled={applying}>
              Descartar prévia
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DiffBlock({ title, tone, lines }: { title?: string; tone: "add" | "remove"; lines: string[] }) {
  const toneClass =
    tone === "add"
      ? "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
      : "border-l-2 border-red-500 bg-red-500/10 text-red-900 dark:text-red-200";
  return (
    <div>
      {title ? <p className="text-xs font-medium text-muted-foreground">{title}</p> : null}
      <pre className={`mt-1 overflow-x-auto whitespace-pre-wrap rounded-md px-2 py-1.5 text-xs ${toneClass}`}>
        {lines.join("\n")}
      </pre>
    </div>
  );
}
