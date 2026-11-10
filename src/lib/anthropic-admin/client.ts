/** Wrapper fino da Admin API da Anthropic (organizações) — usada só pelo
 * painel "Gastos de IA" do Super Admin (ver anthropic-spend.service.ts).
 * Nunca chamado do cliente: `ANTHROPIC_ADMIN_API_KEY` só existe no
 * processo do servidor. */

const BASE_URL = "https://api.anthropic.com/v1/organizations";

export interface AnthropicApiKey {
  id: string;
  name: string;
  workspace_id: string | null;
  status: string;
  partial_key_hint: string;
}

export interface AnthropicWorkspace {
  id: string;
  name: string;
  archived_at: string | null;
}

export interface AnthropicCostResult {
  amount: string;
  workspace_id: string | null;
  description: string;
}

export interface AnthropicCostDay {
  starting_at: string;
  ending_at: string;
  results: AnthropicCostResult[];
}

export interface AnthropicUsageResult {
  api_key_id: string | null;
  model: string;
  uncached_input_tokens: number | null;
  output_tokens: number | null;
}

export interface AnthropicUsageDay {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
}

function adminHeaders() {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_ADMIN_API_KEY não configurada.");
  return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
}

/** Segue `has_more`/`next_page` até esgotar — `page` é o nome do query
 * param de cursor que a Admin API espera (confirmado contra a resposta
 * real: `{"has_more":true,"next_page":"page_..."}`). */
async function fetchAllPages<T>(path: string, params: Record<string, string | string[]>): Promise<T[]> {
  const results: T[] = [];
  let page: string | undefined;
  do {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, v);
    }
    if (page) url.searchParams.set("page", page);

    const res = await fetch(url, { headers: adminHeaders() });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.error?.message ?? `Erro ${res.status} na Admin API da Anthropic.`);
    }
    results.push(...((body.data as T[]) ?? []));
    page = body.has_more ? body.next_page : undefined;
  } while (page);
  return results;
}

export function listApiKeys(): Promise<AnthropicApiKey[]> {
  return fetchAllPages<AnthropicApiKey>("/api_keys", {});
}

export function listWorkspaces(): Promise<AnthropicWorkspace[]> {
  return fetchAllPages<AnthropicWorkspace>("/workspaces", {});
}

/** `results[].amount` vem em CENTAVOS, não dólares — confirmado comparando
 * a soma bruta com o total em dólares exibido no próprio Console
 * ("Custo e gastos"): batem exato dividindo por 100. Quem consome este
 * retorno SEMPRE precisa dividir por 100 antes de mostrar como USD. */
export function getCostReport(startingAt: string): Promise<AnthropicCostDay[]> {
  return fetchAllPages<AnthropicCostDay>("/cost_report", {
    starting_at: startingAt,
    "group_by[]": ["workspace_id", "description"],
  });
}

/** `cost_report` não aceita agrupar por `api_key_id` (só `description`/
 * `workspace_id`) — por isso o detalhamento por chave individual vem daqui
 * (tokens, não dólares diretamente). */
export function getUsageByKey(startingAt: string): Promise<AnthropicUsageDay[]> {
  return fetchAllPages<AnthropicUsageDay>("/usage_report/messages", {
    starting_at: startingAt,
    "group_by[]": ["api_key_id", "model"],
  });
}
