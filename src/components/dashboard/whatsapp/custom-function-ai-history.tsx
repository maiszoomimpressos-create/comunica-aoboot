"use client";

import type { CustomFunctionAiHistoryEntry } from "@/lib/notifications/custom-function-history";
import { formatHistoryTimestamp } from "@/lib/notifications/custom-function-history";
import { CollapsibleAiDescription } from "./ai-request-text";

const TYPE_LABEL: Record<CustomFunctionAiHistoryEntry["type"] | "criacao", string> = {
  criacao: "Criação",
  adicionar: "Adicionar",
  editar: "Editar",
};

function TypeBadge({ type }: { type: keyof typeof TYPE_LABEL }) {
  const tone =
    type === "adicionar"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : type === "editar"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {TYPE_LABEL[type]}
    </span>
  );
}

export function CustomFunctionRequestHistory({
  creationText,
  createdAt,
  history,
}: {
  creationText: string;
  createdAt?: string | Date | null;
  history?: CustomFunctionAiHistoryEntry[];
}) {
  const original = creationText.trim();
  const entries = history ?? [];
  if (!original && entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Pedidos à IA</p>
      <ol className="space-y-2">
        {original ? (
          <li className="rounded-lg border border-border bg-background/80 p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <TypeBadge type="criacao" />
              {createdAt ? (
                <time className="text-[11px] text-muted-foreground" dateTime={new Date(createdAt).toISOString()}>
                  {formatHistoryTimestamp(new Date(createdAt).toISOString())}
                </time>
              ) : null}
            </div>
            <CollapsibleAiDescription text={original} />
          </li>
        ) : null}
        {entries.map((entry, index) => (
          <li key={`${entry.createdAt}-${index}`} className="rounded-lg border border-border bg-background/80 p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <TypeBadge type={entry.type} />
              <time className="text-[11px] text-muted-foreground" dateTime={entry.createdAt}>
                {formatHistoryTimestamp(entry.createdAt)}
              </time>
            </div>
            <CollapsibleAiDescription text={entry.prompt} />
          </li>
        ))}
      </ol>
    </div>
  );
}
