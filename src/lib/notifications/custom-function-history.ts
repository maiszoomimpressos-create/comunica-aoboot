/** Pedidos feitos à IA depois da criação da função. Guardados no mesmo JSON
 * de `fields` (junto de `aiDescription`) — sem coluna nova e sem migration.
 * Funções já salvas não ganham esse campo até o primeiro pedido confirmado. */
export type CustomFunctionAiHistoryType = "adicionar" | "editar";

export interface CustomFunctionAiHistoryEntry {
  type: CustomFunctionAiHistoryType;
  prompt: string;
  createdAt: string;
}

export function parseCustomFunctionAiHistory(raw: unknown): CustomFunctionAiHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomFunctionAiHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type === "adicionar" || row.type === "editar" ? row.type : null;
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    const createdAt = typeof row.createdAt === "string" ? row.createdAt.trim() : "";
    if (!type || !prompt || !createdAt) continue;
    out.push({ type, prompt, createdAt });
  }
  return out;
}

export function appendCustomFunctionAiHistory(
  history: CustomFunctionAiHistoryEntry[] | undefined,
  entry: CustomFunctionAiHistoryEntry
): CustomFunctionAiHistoryEntry[] {
  return [...(history ?? []), entry];
}

export function formatHistoryTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
