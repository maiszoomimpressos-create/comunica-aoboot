/**
 * Personalização e variação do texto de campanha — puro (sem I/O), usado
 * pelo dispatcher na hora do envio e pela prévia no painel (client side).
 *
 * Sintaxe:
 * - Variáveis: `{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`,
 *   `{{empresa}}`. Fallback quando o valor está vazio: `{{nome|cliente}}`.
 * - Variação (spintax): `{Olá|Oi|E aí}` — uma opção sorteada por
 *   destinatário. Chaves sem `|` dentro ficam como estão.
 */

export const CAMPAIGN_TEMPLATE_VARIABLES = [
  { key: "nome", description: "Nome completo do contato" },
  { key: "primeiro_nome", description: "Primeiro nome do contato" },
  { key: "telefone", description: "Telefone do contato" },
  { key: "empresa", description: "Nome da empresa/conexão que envia" },
] as const;

export type CampaignTemplateVariable = (typeof CAMPAIGN_TEMPLATE_VARIABLES)[number]["key"];

export interface CampaignTemplateContext {
  name: string | null;
  phone: string;
  businessName: string;
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^{}]*))?\}\}/g;
const SPINTAX_RE = /\{([^{}]*\|[^{}]*)\}/g;
const HAS_SPINTAX_RE = /\{[^{}]*\|[^{}]*\}/;

function firstName(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function variableValue(key: string, ctx: CampaignTemplateContext): string | undefined {
  switch (key.toLowerCase()) {
    case "nome":
      return ctx.name?.trim() ?? "";
    case "primeiro_nome":
      return firstName(ctx.name);
    case "telefone":
      return ctx.phone;
    case "empresa":
      return ctx.businessName;
    default:
      return undefined;
  }
}

/** Nomes de variáveis usados no texto que não existem — a criação da
 * campanha recusa, pra ninguém receber "Olá {{nmoe}}". */
export function findUnknownVariables(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(VARIABLE_RE)) {
    const key = match[1].toLowerCase();
    if (!CAMPAIGN_TEMPLATE_VARIABLES.some((v) => v.key === key)) unknown.add(match[1]);
  }
  return [...unknown];
}

/** Substitui as variáveis. Valor vazio usa o fallback (`{{nome|cliente}}`)
 * ou vira string vazia; espaços duplicados que sobram são compactados. */
export function renderVariables(text: string, ctx: CampaignTemplateContext): string {
  let replacedEmpty = false;
  const rendered = text.replace(VARIABLE_RE, (whole, key: string, fallback: string | undefined) => {
    const value = variableValue(key, ctx);
    if (value === undefined) return whole;
    const final = value || (fallback?.trim() ?? "");
    if (!final) replacedEmpty = true;
    return final;
  });
  if (!replacedEmpty) return rendered;
  // Só arruma o que a variável vazia deixou ("Olá , tudo" → "Olá, tudo").
  return rendered.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1");
}

/** Sorteia uma opção de cada grupo `{a|b|c}` (rng injetável pra teste). */
export function renderSpintax(text: string, rng: () => number = Math.random): string {
  let current = text;
  // Resolve de dentro pra fora (grupos aninhados) — limite de segurança.
  for (let guard = 0; guard < 10 && HAS_SPINTAX_RE.test(current); guard++) {
    current = current.replace(SPINTAX_RE, (_whole, inner: string) => {
      const options = inner.split("|");
      const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
      return options[index];
    });
  }
  return current;
}

/** Acrescenta o rodapé de descadastro — a não ser que o texto já fale em
 * "SAIR" (o tenant escreveu o próprio rodapé). */
export function appendOptOutFooter(text: string, footer: string | null): string {
  const trimmedFooter = footer?.trim();
  if (!trimmedFooter) return text;
  if (/\bSAIR\b/i.test(text)) return text;
  return text.trim() ? `${text.trimEnd()}\n\n${trimmedFooter}` : trimmedFooter;
}

/** Texto final de um destinatário: variáveis → variação → rodapé. */
export function renderCampaignMessage(
  template: string,
  ctx: CampaignTemplateContext,
  footer: string | null,
  rng: () => number = Math.random
): string {
  return appendOptOutFooter(renderSpintax(renderVariables(template, ctx), rng).trim(), footer);
}

/** O texto usa o nome do contato ({{nome}}/{{primeiro_nome}})? — o
 * dispatcher só busca o nome na Z-API quando precisa. */
export function usesContactName(template: string): boolean {
  for (const match of template.matchAll(VARIABLE_RE)) {
    const key = match[1].toLowerCase();
    if (key === "nome" || key === "primeiro_nome") return true;
  }
  return false;
}
