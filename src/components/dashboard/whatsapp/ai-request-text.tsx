"use client";

const COLLAPSE_AT = 140;

export function resolveAiDescription(aiDescription?: string | null, description?: string | null): string {
  const fromAi = aiDescription?.trim() ?? "";
  if (fromAi) return fromAi;
  return description?.trim() ?? "";
}

export function AiRequestText({ text }: { text: string }) {
  const value = text.trim();
  if (!value) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">O que você pediu para a IA</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-foreground">{value}</pre>
    </div>
  );
}

export function CollapsibleAiDescription({ text }: { text: string }) {
  const value = text.trim();
  if (!value) return null;
  if (value.length <= COLLAPSE_AT) {
    return <p className="w-full basis-full whitespace-pre-wrap text-xs text-muted-foreground">{value}</p>;
  }
  return (
    <details className="w-full basis-full text-xs text-muted-foreground">
      <summary className="cursor-pointer list-inside hover:text-foreground">
        {value.slice(0, COLLAPSE_AT).trimEnd()}…
      </summary>
      <pre className="mt-1 whitespace-pre-wrap text-xs text-foreground">{value}</pre>
    </details>
  );
}
