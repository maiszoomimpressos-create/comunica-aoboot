import { anthropic } from "@ai-sdk/anthropic";

/** Resolve uma string "provider/model" do AI Gateway pra uma chamada direta
 * à Anthropic quando `ANTHROPIC_API_KEY` está disponível — evita depender
 * de crédito pago no AI Gateway da Vercel quando já existe saldo direto na
 * conta da Anthropic (confirmado em produção: a conta do Gateway é free
 * tier e bloqueia alguns modelos com 403 "Free tier users do not have
 * access to this model"). Fora do caso "anthropic/...", ou sem a chave,
 * usa a string normalmente via Gateway. Conversão de ID: a Anthropic usa
 * hífen em vez de ponto na versão (ex: "anthropic/claude-haiku-5.5" ->
 * "claude-haiku-5-5"), confirmado contra GET /v1/models da própria
 * Anthropic. */
export function resolveModel(modelString: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !modelString.startsWith("anthropic/")) return modelString;

  const anthropicModelId = modelString.slice("anthropic/".length).replaceAll(".", "-");
  return anthropic(anthropicModelId);
}
