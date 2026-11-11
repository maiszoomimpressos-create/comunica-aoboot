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

/** Sinais "suaves" (nome + texto repetido + ritmo) exigem este volume mínimo. */
export const SOFT_BURST_MAX = 4;
export const SOFT_FLOOD_MAX = 10;

export type InboundSample = {
  at: Date;
  text: string | null;
  chatName: string | null;
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

export function detectAutomaticSender(samples: InboundSample[], now = new Date()): DetectionResult {
  const last60s = samples.filter((s) => s.at.getTime() >= now.getTime() - INBOUND_BURST_WINDOW_MS);
  const last5min = samples.filter((s) => s.at.getTime() >= now.getTime() - INBOUND_FLOOD_WINDOW_MS);

  const inboundLast60s = last60s.length;
  const inboundLast5min = last5min.length;
  const repeatedText = hasRepeatedText(last5min);
  const regularRhythm = hasRegularRhythm(last5min);
  const chatName = [...last5min].reverse().find((s) => s.chatName?.trim())?.chatName?.trim() ?? null;
  const operatorLikeName = isOperatorLikeName(chatName);

  const reasons: string[] = [];
  if (inboundLast60s >= INBOUND_BURST_MAX) {
    reasons.push(`volume: ${inboundLast60s} mensagens em 60s`);
  }
  if (inboundLast5min >= INBOUND_FLOOD_MAX) {
    reasons.push(`volume: ${inboundLast5min} mensagens em 5 min`);
  }

  const softVolume = inboundLast60s >= SOFT_BURST_MAX || inboundLast5min >= SOFT_FLOOD_MAX;
  const botLike = operatorLikeName || repeatedText;
  const softSignals = [
    operatorLikeName ? "nome de operadora/robô" : null,
    repeatedText ? "texto repetido" : null,
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
    },
  };
}

export function formatPauseReason(result: DetectionResult): string {
  const name = result.signals.chatName ? ` (${result.signals.chatName})` : "";
  return `Pausa automática anti-loop${name}: ${result.reasons.join("; ")}`;
}
