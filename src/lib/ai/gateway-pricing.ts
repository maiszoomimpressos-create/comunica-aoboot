import { gateway } from "ai";

type ModelPricing = { inputPerToken: number; outputPerToken: number };

// Catálogo de preços do AI Gateway é o mesmo preço usado por
// bot-attendant.service.ts mesmo quando ele pula o Gateway (chamada direta
// à Anthropic via ANTHROPIC_API_KEY) — serve de estimativa confiável de
// custo sem precisar manter uma tabela de preços própria por modelo.
// Cacheado em memória (processo do servidor) por um tempo curto: evita bater
// no Gateway a cada mensagem, mas ainda reflete mudança de preço/modelo sem
// precisar reiniciar o processo.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; pricingByModel: Map<string, ModelPricing> } | null = null;

async function loadPricingByModel(): Promise<Map<string, ModelPricing>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.pricingByModel;

  const { models } = await gateway.getAvailableModels();
  const pricingByModel = new Map<string, ModelPricing>();
  for (const entry of models) {
    if (!entry.pricing) continue;
    pricingByModel.set(entry.id, {
      inputPerToken: Number(entry.pricing.input),
      outputPerToken: Number(entry.pricing.output),
    });
  }

  cache = { at: Date.now(), pricingByModel };
  return pricingByModel;
}

/** `null` when the model isn't in the Gateway's catalog (e.g. Super Admin
 * typed an unrecognized "provider/model" string) or the lookup fails — the
 * caller still keeps the raw token counts, just without a dollar estimate. */
export async function estimateChatCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): Promise<number | null> {
  if (inputTokens == null || outputTokens == null) return null;

  try {
    const pricingByModel = await loadPricingByModel();
    const pricing = pricingByModel.get(model);
    if (!pricing) return null;
    return inputTokens * pricing.inputPerToken + outputTokens * pricing.outputPerToken;
  } catch {
    return null;
  }
}
