/**
 * Proteções de campanha com CONTATO FRIO (captado do Google — quem nunca
 * falou com a empresa). Puro (sem I/O), usado pelo dispatcher, pela
 * criação/início da campanha e pelo painel. Testado em
 * tests/campaigns/cold-outreach.test.ts.
 *
 * 1. SAIR obrigatório: o rodapé de descadastro não pode ser desligado nem
 *    trocado por um texto sem "SAIR"; e a sequência montada pra cada
 *    contato SEMPRE termina com uma instrução de SAIR (se nenhuma parte já
 *    tem "responda SAIR"/similar, o rodapé vai na última parte com texto
 *    ou como mensagem extra).
 * 2. Teto diário próprio (padrão 30 por conexão), além do limite normal e
 *    do aquecimento — vale o menor dos três.
 * 3. Intervalo entre contatos maior (padrão 60–120 s).
 * 4. A 1ª mensagem deve identificar a empresa ({{empresa}}) — aviso.
 */
import { DEFAULT_OPT_OUT_FOOTER } from "@/config/whatsapp-campaign-defaults";
import type { RateSettings } from "./schedule";
import type { CampaignPart, RenderedPart } from "./sequence";

export const COLD_DEFAULTS = {
  dailyLimit: 30,
  minMessageIntervalSeconds: 60,
  maxMessageIntervalSeconds: 120,
} as const;

/** Limites aceitos no painel. */
export const COLD_LIMITS = {
  dailyLimitMax: 100,
  minIntervalFloor: 30,
} as const;

/** "responda SAIR", "envie SAIR", "digite *SAIR*"… — uma instrução de
 * verdade, não só a palavra solta ("não quero sair de casa"). */
const OPT_OUT_INSTRUCTION = /\b(responda|responde|envie|mande|digite|escreva|responder|enviar|digitar)\b[^\n]{0,40}?["'*_]*SAIR\b/i;

export function hasOptOutInstruction(text: string): boolean {
  return OPT_OUT_INSTRUCTION.test(text);
}

/** Rodapé efetivo. Campanha normal: o configurado (null se desligado).
 * Campanha fria: sempre um rodapé com instrução de SAIR — o configurado se
 * tiver a instrução, senão o padrão. */
export function resolveOptOutFooter(
  settings: { optOutFooterEnabled: boolean; optOutFooterText: string | null },
  coldOutreach: boolean
): string | null {
  const custom = settings.optOutFooterText?.trim() || null;
  if (!coldOutreach) return settings.optOutFooterEnabled ? custom || DEFAULT_OPT_OUT_FOOTER : null;
  if (custom && hasOptOutInstruction(custom)) return custom;
  return DEFAULT_OPT_OUT_FOOTER;
}

/**
 * Garante que a sequência (já montada por renderSequence) tem a instrução
 * de SAIR. Se alguma parte já tem, nada muda. Senão o rodapé vai na
 * última parte que aceita texto (texto/legenda) ou, se só houver áudio,
 * vira uma mensagem de texto extra no fim. O rodapé sempre tem a
 * instrução (resolveOptOutFooter).
 */
export function ensureOptOutInstruction(rendered: RenderedPart[], footer: string): RenderedPart[] {
  if (rendered.some((p) => hasOptOutInstruction(p.text))) return rendered;
  const out = [...rendered];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].type !== "audio") {
      const text = out[i].text.trim();
      out[i] = { ...out[i], text: text ? `${text}\n\n${footer}` : footer };
      return out;
    }
  }
  out.push({ index: out.length, type: "text", text: footer, mediaUrl: null, fileName: null });
  return out;
}

/** Ritmo de campanha fria: intervalo entre contatos nunca menor que o de
 * contato frio. */
export function applyColdPacing(
  rate: RateSettings,
  cold: { coldMinMessageIntervalSeconds: number; coldMaxMessageIntervalSeconds: number }
): RateSettings {
  const min = Math.max(rate.minMessageIntervalSeconds, cold.coldMinMessageIntervalSeconds);
  const max = Math.max(rate.maxMessageIntervalSeconds, cold.coldMaxMessageIntervalSeconds, min);
  return { ...rate, minMessageIntervalSeconds: min, maxMessageIntervalSeconds: max };
}

/** Quantos contatos frios ainda dá pra mandar hoje nesta conexão. */
export function coldRemainingToday(coldDailyLimit: number, coldDailySentCount: number): number {
  return Math.max(0, coldDailyLimit - coldDailySentCount);
}

/** A 1ª mensagem com texto identifica a empresa ({{empresa}} ou o nome
 * escrito)? Só aviso no painel. */
export function firstMessageIdentifiesBusiness(parts: CampaignPart[], businessName: string): boolean {
  const first = parts.find((p) => p.type !== "audio" && p.text?.trim());
  if (!first?.text) return false;
  if (/\{\{\s*empresa\s*\}\}/i.test(first.text)) return true;
  const name = businessName.trim().toLowerCase();
  return name.length >= 3 && first.text.toLowerCase().includes(name);
}
