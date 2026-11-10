import { listApiKeys, listWorkspaces, getCostReport, getUsageByKey } from "@/lib/anthropic-admin/client";

export interface AnthropicSpendByWorkspace {
  id: string | null;
  name: string;
  costUsd: number;
  isClaudeCodeWorkspace: boolean;
}

export interface AnthropicSpendByApiKey {
  id: string;
  name: string;
  status: string;
  workspaceName: string;
  inputTokens: number;
  outputTokens: number;
  models: string[];
  isCurrentAppKey: boolean;
}

export interface AnthropicSpendOverview {
  totalCostUsd: number;
  byWorkspace: AnthropicSpendByWorkspace[];
  byApiKey: AnthropicSpendByApiKey[];
}

const DEFAULT_WORKSPACE_NAME = "Workspace padrão";

/** O sufixo visível em `partial_key_hint` (ex: "sk-ant-api03-zjj...zwAA" ->
 * "zwAA") é o único jeito de identificar, sem nunca expor a chave
 * completa, qual cadastro da Anthropic é a mesma que está em uso agora
 * neste `.env`. */
function matchesCurrentAppKey(partialKeyHint: string): boolean {
  const currentKey = process.env.ANTHROPIC_API_KEY;
  if (!currentKey) return false;
  const suffix = partialKeyHint.split("...").pop();
  return !!suffix && currentKey.endsWith(suffix);
}

/** Visão consolidada de gasto na organização Anthropic inteira (todas as
 * chaves, todos os workspaces) — ver "Gastos de IA" no Super Admin
 * (app/(admin)/admin/ia/page.tsx). Combina dois relatórios porque nenhum
 * dos dois sozinho tem tudo: `cost_report` dá valor em dólares mas só
 * agrupa por workspace; `usage_report/messages` dá tokens por chave
 * individual mas não converte em dólares. */
export async function getAnthropicSpendOverview(days: number): Promise<AnthropicSpendOverview> {
  const startingAt = new Date(Date.now() - days * 86400_000).toISOString();

  const [apiKeys, workspaces, costDays, usageDays] = await Promise.all([
    listApiKeys(),
    listWorkspaces(),
    getCostReport(startingAt),
    getUsageByKey(startingAt),
  ]);

  const workspaceNameById = new Map(workspaces.map((w) => [w.id, w.name]));
  const claudeCodeWorkspaceIds = new Set(
    workspaces.filter((w) => w.name === "Claude Code").map((w) => w.id)
  );

  // amount vem em centavos (ver client.ts) — sempre /100 pra virar dólares.
  const costByWorkspace = new Map<string | null, number>();
  let totalCostUsd = 0;
  for (const day of costDays) {
    for (const result of day.results) {
      const amountUsd = Number(result.amount) / 100;
      totalCostUsd += amountUsd;
      costByWorkspace.set(result.workspace_id, (costByWorkspace.get(result.workspace_id) ?? 0) + amountUsd);
    }
  }

  const byWorkspace: AnthropicSpendByWorkspace[] = [...costByWorkspace.entries()]
    .map(([id, costUsd]) => ({
      id,
      name: id ? (workspaceNameById.get(id) ?? "Workspace removido") : DEFAULT_WORKSPACE_NAME,
      costUsd,
      isClaudeCodeWorkspace: id != null && claudeCodeWorkspaceIds.has(id),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const usageByApiKey = new Map<string, { inputTokens: number; outputTokens: number; models: Set<string> }>();
  for (const day of usageDays) {
    for (const result of day.results) {
      if (!result.api_key_id) continue;
      const entry = usageByApiKey.get(result.api_key_id) ?? {
        inputTokens: 0,
        outputTokens: 0,
        models: new Set<string>(),
      };
      entry.inputTokens += result.uncached_input_tokens ?? 0;
      entry.outputTokens += result.output_tokens ?? 0;
      entry.models.add(result.model);
      usageByApiKey.set(result.api_key_id, entry);
    }
  }

  const byApiKey: AnthropicSpendByApiKey[] = apiKeys
    .map((key) => {
      const usage = usageByApiKey.get(key.id);
      return {
        id: key.id,
        name: key.name,
        status: key.status,
        workspaceName: key.workspace_id
          ? (workspaceNameById.get(key.workspace_id) ?? "Workspace removido")
          : DEFAULT_WORKSPACE_NAME,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        models: usage ? [...usage.models] : [],
        isCurrentAppKey: matchesCurrentAppKey(key.partial_key_hint),
      };
    })
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

  return { totalCostUsd, byWorkspace, byApiKey };
}
