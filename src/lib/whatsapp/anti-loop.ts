/**
 * Detecção de remetente automático (robô↔robô) e constantes da pausa
 * persistente de atendimento automático.
 *
 * A pausa em si reusa RelaySession PENDING no setor interno
 * "Pausa automática (sistema)" — ver anti-loop.service.ts. Sem tabela nova
 * e sem migração: o inbound é interceptado antes do fluxo e da IA
 * (maybeHandleInboundBotMessage).
 */

export const AUTO_PAUSE_SETOR_NAME = "Pausa automática (sistema)";

export const AUTO_PAUSE_SETOR_DESCRIPTION =
  "Setor interno, sem atendentes, usado apenas para pausar o atendimento automático de um contato (proteção anti-loop). Não enviar mensagens por este setor.";

/** Volume: muitas mensagens inbound no mesmo contato em pouco tempo. */
export const INBOUND_BURST_MAX = 6;
export const INBOUND_BURST_WINDOW_MS = 60_000;
export const INBOUND_FLOOD_MAX = 15;
export const INBOUND_FLOOD_WINDOW_MS = 5 * 60_000;

/**
 * Teto de segurança: mesmo sem detectar robô, o fluxo/IA não manda mais
 * que este número de respostas automáticas por contato por minuto.
 */
export const MAX_AUTO_REPLIES_PER_MINUTE = 5;
export const AUTO_REPLY_WINDOW_MS = 60_000;

/**
 * Teto em janela maior: mesmo em ritmo lento (abaixo dos limites de 60s e
 * 5 min), um robô conversando com o nosso fluxo acumula respostas. Passou
 * disso, a conversa é pausada (mesma pausa persistente da detecção).
 * "Respostas automáticas" = min(mensagens recebidas, mensagens enviadas) na
 * janela — cada resposta nossa precisa de uma mensagem do contato que a
 * provocou, então notificações avulsas não inflam a conta.
 */
export const MAX_AUTO_REPLIES_PER_HOUR = 30;
export const MAX_AUTO_REPLIES_PER_DAY = 60;
export const AUTO_REPLY_HOUR_WINDOW_MS = 60 * 60_000;
export const AUTO_REPLY_DAY_WINDOW_MS = 24 * 60 * 60_000;

/** Resposta "instantânea": o contato responde até 3s depois de uma mensagem nossa. */
export const FAST_REPLY_MS = 3_000;
export const FAST_REPLY_MIN_COUNT = 3;

/** Textos quase idênticos: similaridade de palavras (Dice) e tamanho mínimo. */
export const NEAR_DUPLICATE_SIMILARITY = 0.85;
export const NEAR_DUPLICATE_MIN_LENGTH = 30;
/** Repetições quase idênticas de texto longo que fecham sozinhas como robô. */
export const NEAR_DUPLICATE_STRONG_COUNT = 3;

/** Sinais "suaves" (nome + texto repetido + ritmo) exigem este volume mínimo. */
export const SOFT_BURST_MAX = 4;
export const SOFT_FLOOD_MAX = 10;

export type InboundSample = {
  at: Date;
  text: string | null;
  chatName: string | null;
  /** Usado para descartar reentregas do mesmo webhook (Z-API reenvia). */
  messageId?: string | null;
};

/** Contexto opcional: horários das nossas mensagens enviadas a este contato. */
export type DetectionContext = {
  sentAt?: Date[];
};

export type AutoReplySample = {
  at: Date;
  phone: string;
};

export type DetectionSignals = {
  inboundLast60s: number;
  inboundLast5min: number;
  repeatedText: boolean;
  regularRhythm: boolean;
  operatorLikeName: boolean;
  chatName: string | null;
  nearDuplicateCount?: number;
  menuLike?: boolean;
  fastReplies?: number;
};

export type DetectionResult = {
  detected: boolean;
  reasons: string[];
  signals: DetectionSignals;
};

const OPERATOR_NAME_RE =
  /\b(minha claro|app minha claro|meu vivo|vivo easy|vivo pay|minha tim|tim beta|oi fibra|minha oi|atendimento virtual|assistente virtual|atendente virtual|chatbot)\b/i;

const OPERATOR_NAME_EXACT_RE = /^(claro|vivo|tim|oi|algar)$/i;

export function maskContactPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  const visible = digits.slice(-4);
  const prefix = digits.startsWith("55") && digits.length >= 12 ? "55" : "";
  const hidden = Math.max(4, digits.length - visible.length - prefix.length);
  return `${prefix}${"•".repeat(hidden)}${visible}`;
}

export function normalizeInboundText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[*_~`]+/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove reentregas do mesmo messageId (mantém a primeira). */
export function dedupeInboundSamples(samples: InboundSample[]): InboundSample[] {
  const seen = new Set<string>();
  const out: InboundSample[] = [];
  for (const s of samples) {
    const id = s.messageId?.trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(s);
  }
  return out;
}

/** Similaridade de Dice sobre o conjunto de palavras normalizadas (0..1). */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(normalizeInboundText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeInboundText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * Maior grupo de mensagens longas quase idênticas (ex.: o mesmo menu de
 * boas-vindas reenviado a cada resposta nossa). Textos curtos ("ok", "sim")
 * ficam de fora — pessoa repete isso naturalmente.
 */
export function largestNearDuplicateGroup(
  samples: InboundSample[],
  minSimilarity = NEAR_DUPLICATE_SIMILARITY,
  minLength = NEAR_DUPLICATE_MIN_LENGTH
): number {
  const texts = samples.map((s) => s.text ?? "").filter((t) => normalizeInboundText(t).length >= minLength);
  let best = 0;
  for (let i = 0; i < texts.length; i++) {
    let group = 1;
    for (let j = 0; j < texts.length; j++) {
      if (i !== j && textSimilarity(texts[i], texts[j]) >= minSimilarity) group++;
    }
    if (group > best) best = group;
  }
  return best;
}

const MENU_PHRASE_RE =
  /(escolha uma das op[cç][oõ]es|escolha uma op[cç][aã]o|selecione uma op[cç][aã]o|digite o n[uú]mero|digite a op[cç][aã]o|responda com o n[uú]mero|op[cç][aã]o desejada|menu principal|n[aã]o consegui identificar sua solicita[cç][aã]o|n[aã]o entendi sua (mensagem|resposta|solicita[cç][aã]o))/i;
const MENU_OPTION_LINE_RE = /^\s*\*?\d{1,2}\*?\s*[-–—).:]\s*\S/;

/** Texto com cara de menu de URA/chatbot: frase típica ou 2+ linhas "1 - Opção". */
export function isMenuLikeText(text: string | null | undefined): boolean {
  if (!text) return false;
  if (MENU_PHRASE_RE.test(text)) return true;
  const optionLines = text.split(/\r?\n/).filter((line) => MENU_OPTION_LINE_RE.test(line)).length;
  return optionLines >= 2;
}

/**
 * Quantas mensagens do contato chegaram até `fastMs` depois de uma mensagem
 * nossa (cada envio nosso conta no máximo uma vez). Pessoa não lê e digita
 * em menos de 3s várias vezes seguidas; robô sim.
 */
export function countFastReplies(samples: InboundSample[], sentAt: Date[], fastMs = FAST_REPLY_MS): number {
  const sent = sentAt.map((d) => d.getTime()).sort((a, b) => a - b);
  const used = new Set<number>();
  let count = 0;
  for (const s of samples) {
    const t = s.at.getTime();
    let lastIdx = -1;
    for (let i = 0; i < sent.length && sent[i] <= t; i++) lastIdx = i;
    if (lastIdx < 0 || used.has(lastIdx)) continue;
    if (t - sent[lastIdx] <= fastMs) {
      used.add(lastIdx);
      count++;
    }
  }
  return count;
}

export type LongWindowCounts = {
  inbound1h: number;
  sent1h: number;
  inbound24h: number;
  sent24h: number;
};

/** Teto de 1h / 24h. Retorna o motivo da pausa ou null. */
export function evaluateLongWindowCap(counts: LongWindowCounts): string | null {
  const replies1h = Math.min(counts.inbound1h, counts.sent1h);
  if (replies1h >= MAX_AUTO_REPLIES_PER_HOUR) {
    return `teto: ${replies1h} respostas automáticas em 1h (máx. ${MAX_AUTO_REPLIES_PER_HOUR})`;
  }
  const replies24h = Math.min(counts.inbound24h, counts.sent24h);
  if (replies24h >= MAX_AUTO_REPLIES_PER_DAY) {
    return `teto: ${replies24h} respostas automáticas em 24h (máx. ${MAX_AUTO_REPLIES_PER_DAY})`;
  }
  return null;
}

export function isOperatorLikeName(chatName: string | null | undefined): boolean {
  if (!chatName) return false;
  const trimmed = chatName.trim();
  if (!trimmed) return false;
  return OPERATOR_NAME_RE.test(trimmed) || OPERATOR_NAME_EXACT_RE.test(trimmed);
}

export function countInWindow(samples: { at: Date }[], windowMs: number, now: Date): number {
  const from = now.getTime() - windowMs;
  return samples.filter((s) => s.at.getTime() >= from && s.at.getTime() <= now.getTime()).length;
}

export function hasRepeatedText(samples: InboundSample[]): boolean {
  const normalized = samples.map((s) => normalizeInboundText(s.text));
  const emptyCount = normalized.filter((t) => t.length === 0).length;
  if (emptyCount >= 4) return true;

  const withText = normalized.filter((t) => t.length > 0);
  if (withText.length < 3) return false;

  const counts = new Map<string, number>();
  for (const t of withText) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = Math.max(...counts.values());
  if (top >= 3) return true;
  return top / withText.length >= 0.5 && top >= 3;
}

/**
 * Ritmo regular: pelo menos 4 mensagens, intervalo médio entre 2s e 25s,
 * e pouca variação (coeficiente de variação < 0.3).
 */
export function hasRegularRhythm(samples: InboundSample[]): boolean {
  if (samples.length < 4) return false;
  const times = samples.map((s) => s.at.getTime()).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean < 2_000 || mean > 25_000) return false;
  const variance = intervals.reduce((acc, n) => acc + (n - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < 0.3;
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Compara telefone do contato com o `phone` de um status (pode ser o número ou o LID). */
export function autoReplyPhoneMatches(
  eventPhone: string,
  contactPhone: string,
  chatLid?: string | null
): boolean {
  const eventDigits = digitsOnly(eventPhone);
  if (!eventDigits) return false;
  const contactDigits = digitsOnly(contactPhone);
  if (contactDigits && eventDigits === contactDigits) return true;
  const lidDigits = digitsOnly(chatLid ?? "");
  return lidDigits.length > 0 && eventDigits === lidDigits;
}

export function countRecentAutoReplies(
  samples: AutoReplySample[],
  contactPhone: string,
  chatLid: string | null | undefined,
  now: Date,
  windowMs = AUTO_REPLY_WINDOW_MS
): number {
  const from = now.getTime() - windowMs;
  return samples.filter(
    (s) =>
      s.at.getTime() >= from &&
      s.at.getTime() <= now.getTime() &&
      autoReplyPhoneMatches(s.phone, contactPhone, chatLid)
  ).length;
}

export function detectAutomaticSender(
  rawSamples: InboundSample[],
  now = new Date(),
  context: DetectionContext = {}
): DetectionResult {
  const samples = dedupeInboundSamples(rawSamples);
  const last60s = samples.filter((s) => s.at.getTime() >= now.getTime() - INBOUND_BURST_WINDOW_MS);
  const last5min = samples.filter((s) => s.at.getTime() >= now.getTime() - INBOUND_FLOOD_WINDOW_MS);

  const inboundLast60s = last60s.length;
  const inboundLast5min = last5min.length;
  const repeatedText = hasRepeatedText(last5min);
  const regularRhythm = hasRegularRhythm(last5min);
  const chatName = [...last5min].reverse().find((s) => s.chatName?.trim())?.chatName?.trim() ?? null;
  const operatorLikeName = isOperatorLikeName(chatName);
  const nearDuplicateCount = largestNearDuplicateGroup(last5min);
  const menuLike = last5min.some((s) => isMenuLikeText(s.text));
  const sentAt = (context.sentAt ?? []).filter(
    (d) => d.getTime() >= now.getTime() - INBOUND_FLOOD_WINDOW_MS && d.getTime() <= now.getTime()
  );
  const fastReplies = countFastReplies(last5min, sentAt);

  const reasons: string[] = [];
  if (inboundLast60s >= INBOUND_BURST_MAX) {
    reasons.push(`volume: ${inboundLast60s} mensagens em 60s`);
  }
  if (inboundLast5min >= INBOUND_FLOOD_MAX) {
    reasons.push(`volume: ${inboundLast5min} mensagens em 5 min`);
  }

  // Mesmo texto longo (quase) idêntico 3x em 5 min: menu/URA reenviado.
  if (nearDuplicateCount >= NEAR_DUPLICATE_STRONG_COUNT) {
    reasons.push(`texto quase idêntico repetido ${nearDuplicateCount}x`);
  }
  // 2x já basta quando o texto tem cara de menu de chatbot (ou nome de
  // operadora) e nós respondemos no meio: é robô respondendo ao nosso robô.
  else if (nearDuplicateCount >= 2 && (menuLike || operatorLikeName) && sentAt.length > 0) {
    reasons.push(`menu automático repetido ${nearDuplicateCount}x após nossa resposta`);
  }
  if (fastReplies >= FAST_REPLY_MIN_COUNT) {
    reasons.push(`respostas instantâneas: ${fastReplies} em até ${FAST_REPLY_MS / 1000}s após nossa mensagem`);
  }

  const softVolume = inboundLast60s >= SOFT_BURST_MAX || inboundLast5min >= SOFT_FLOOD_MAX;
  const botLike = operatorLikeName || repeatedText || menuLike || nearDuplicateCount >= 2;
  const softSignals = [
    operatorLikeName ? "nome de operadora/robô" : null,
    repeatedText ? "texto repetido" : null,
    menuLike ? "menu de chatbot" : null,
    regularRhythm ? "ritmo regular" : null,
    softVolume ? "volume elevado" : null,
  ].filter((s): s is string => !!s);

  // Ritmo + volume sozinhos não bastam: uma pessoa pode mandar várias
  // mensagens em intervalos parecidos. Os sinais suaves só fecham com
  // nome típico de robô ou texto repetido, além de ritmo ou volume.
  if (reasons.length === 0 && botLike && (regularRhythm || softVolume) && softSignals.length >= 2) {
    reasons.push(`sinais combinados (${softSignals.join(", ")})`);
  }

  return {
    detected: reasons.length > 0,
    reasons,
    signals: {
      inboundLast60s,
      inboundLast5min,
      repeatedText,
      regularRhythm,
      operatorLikeName,
      chatName,
      nearDuplicateCount,
      menuLike,
      fastReplies,
    },
  };
}

export function formatPauseReason(result: DetectionResult): string {
  const name = result.signals.chatName ? ` (${result.signals.chatName})` : "";
  return `Pausa automática anti-loop${name}: ${result.reasons.join("; ")}`;
}
