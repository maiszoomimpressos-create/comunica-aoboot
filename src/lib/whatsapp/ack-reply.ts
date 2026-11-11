/**
 * Silêncio pós-notificação: quando o sistema manda uma notificação/
 * confirmação automática (funções de notificação, alerta de saldo) e o
 * destinatário responde só com agradecimento, cumprimento ou um "ok", o bot
 * não abre fluxo nem IA (decisão do Neomar, 11/11/2026). Qualquer coisa
 * além disso segue o atendimento normal.
 *
 * Classificador determinístico e conservador: só silencia quando TODA a
 * mensagem é feita de expressões conhecidas (ou só emojis positivos). Na
 * dúvida (palavra desconhecida, pergunta, texto longo), NÃO silencia.
 *
 * Integração: ver ack-silence.service.ts (registro do envio via AuditLog
 * `whatsapp.notification_sent` e interceptação no inbound).
 */

import { normalizeBrazilianMobile } from "./phone-format";

/** Janela depois de uma notificação em que um "obrigado" é ignorado. */
export const ACK_SILENCE_WINDOW_MS = 6 * 60 * 60_000;

/** Mensagem com mais caracteres que isso nunca é tratada como agradecimento. */
export const ACK_MAX_CHARS = 80;
/** Nem com mais palavras que isso. */
export const ACK_MAX_TOKENS = 10;

/**
 * Expressões aceitas (já normalizadas: sem acento, minúsculas). Frases de
 * várias palavras são casadas antes das palavras soltas.
 */
export const ACK_PHRASES: readonly string[] = [
  // agradecimento
  "obrigado", "obrigada", "obrigadu", "obg", "obgd", "obgda", "obgdo", "obgado", "obrigadao",
  "brigado", "brigada", "brigadao", "brigadu", "grato", "grata", "agradeco", "agradecido",
  "agradecida", "gratidao", "valeu", "vlw", "valew", "vleu", "thanks", "thank you", "thx", "tks",
  "muito obrigado", "muito obrigada", "mt obrigado", "mto obrigado", "obrigado mesmo",
  "deus abencoe", "deus te abencoe", "fica com deus", "amem", "tmj", "tamo junto", "tamo juntos",
  // cumprimento
  "oi", "ola", "opa", "oie", "eai", "e ai", "salve", "bom dia", "boa tarde", "boa noite",
  "bdia", "bd", "boa", "ate mais", "ate logo", "tchau", "falou", "flw", "abraco", "abracos",
  "abs", "bjs", "beijos", "boa viagem", "bom trabalho", "bom descanso", "boa semana", "bom fim de semana",
  // reconhecimento curto
  "ok", "okay", "okey", "oki", "okk", "blz", "beleza", "certo", "certinho", "ta", "ta bom",
  "ta certo", "ta otimo", "ta ok", "ta beleza", "esta bem", "tudo certo", "tudo bem", "tudo otimo",
  "tudo ok", "td certo", "td bem", "entendi", "entendido", "combinado", "show", "show de bola",
  "top", "perfeito", "otimo", "otima", "maravilha", "maravilhoso", "massa", "legal", "joia",
  "joinha", "sim", "isso", "isso ai", "uhum", "aham", "ss", "positivo", "recebido", "recebi",
  "confirmado", "confirmada", "confirmo", "de acordo", "certeza", "claro", "pode deixar", "fechado",
  "excelente", "lindo", "bacana", "demais", "sucesso", "gratos", "agradecemos",
];

/** Palavras que só complementam (não bastam sozinhas). */
const FILLER_TOKENS = new Set([
  "e", "a", "o", "pra", "para", "por", "pelo", "pela", "de", "do", "da", "tudo", "td", "muito", "mt",
  "mto", "mtu", "mesmo", "demais", "voce", "vc", "voces", "vcs", "tb", "tbm", "tambem", "pro",
  "amigo", "amiga", "querido", "querida", "moco", "moca", "senhor", "senhora", "sr", "sra", "irmao",
  "mano", "cara", "viu", "ne", "entao", "aqui", "ai", "la", "ate",
  "aviso", "mensagem", "info", "informacao", "confirmacao", "atencao", "retorno", "carinho",
]);

/** Emojis que indicam problema/dúvida - com eles nunca silencia. */
const NEGATIVE_EMOJI_RE = /[\u{1F44E}\u{1F621}\u{1F620}\u{1F92C}\u{1F624}\u{1F622}\u{1F62D}\u{1F61E}\u{2639}\u{1F641}\u{1F61F}\u{1F615}\u{2753}\u{2754}\u{2049}\u{203C}\u{1F6A8}\u{26A0}\u{1F914}\u{1F928}\u{1F633}\u{1F631}\u{1F630}\u{1F625}\u{1F494}]/u;

const EMOJI_RE = /\p{Extended_Pictographic}/u;
/** Tudo que acompanha emoji (modificadores, ZWJ, variação, tons de pele, bandeiras). */
const EMOJI_JUNK_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/gu;

const LAUGH_RE = /^(k+|(rs)+|(ha)+h?|(he)+h?|(hua)+h?)$/;

export type AckKind = "text" | "emoji";

export type AckClassification = { ack: true; kind: AckKind } | { ack: false; reason: string };

/** Minúsculas, sem acento, sem pontuação/emoji, letras repetidas colapsadas ("okkk" -> "ok"). */
export function normalizeAckText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/(\p{L})\1+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseRepeats(value: string): string {
  return value.replace(/(\p{L})\1+/gu, "$1");
}

const PHRASES = [...new Set(ACK_PHRASES.map((p) => collapseRepeats(p)))]
  .map((p) => p.split(" "))
  .sort((a, b) => b.length - a.length);

const FILLERS = new Set([...FILLER_TOKENS].map((t) => collapseRepeats(t)));

/**
 * `true` só quando a mensagem inteira é agradecimento/cumprimento/"ok"
 * (ou só emojis positivos). Pergunta ("?"), número, link, palavra fora da
 * lista ou texto longo -> não é ack.
 */
export function classifyAckReply(text: string | null | undefined): AckClassification {
  if (text == null) return { ack: false, reason: "sem texto" };
  const raw = text.trim();
  if (!raw) return { ack: false, reason: "vazio" };
  if (raw.length > ACK_MAX_CHARS) return { ack: false, reason: "longo" };
  if (raw.includes("?") || raw.includes("¿")) return { ack: false, reason: "pergunta" };
  if (/https?:\/\/|www\./i.test(raw)) return { ack: false, reason: "link" };
  if (/\d/.test(raw)) return { ack: false, reason: "numero" };
  if (NEGATIVE_EMOJI_RE.test(raw)) return { ack: false, reason: "emoji negativo" };

  const hasEmoji = EMOJI_RE.test(raw);
  const withoutEmoji = raw.replace(EMOJI_JUNK_RE, "");
  const normalized = normalizeAckText(withoutEmoji);

  if (!normalized) {
    // Só emoji (com ou sem pontuação simples tipo "!" ou ".").
    if (hasEmoji && /^[\s!.,;:~\-*]*$/u.test(withoutEmoji)) return { ack: true, kind: "emoji" };
    return { ack: false, reason: "sem palavras" };
  }

  const tokens = normalized.split(" ");
  if (tokens.length > ACK_MAX_TOKENS) return { ack: false, reason: "muitas palavras" };

  let meaningful = 0;
  let i = 0;
  while (i < tokens.length) {
    const phrase = PHRASES.find((p) => p.every((word, k) => tokens[i + k] === word));
    if (phrase) {
      meaningful++;
      i += phrase.length;
      continue;
    }
    const token = tokens[i];
    if (FILLERS.has(token) || LAUGH_RE.test(token)) {
      i++;
      continue;
    }
    return { ack: false, reason: "palavra fora da lista" };
  }

  if (meaningful === 0) return { ack: false, reason: "so complemento" };
  return { ack: true, kind: "text" };
}

/** Dígitos do telefone no formato canônico BR (com o 9º dígito), pra casar
 * o `to` da notificação com o `phone` do webhook. */
export function canonicalContactDigits(phone: string | null | undefined): string {
  return normalizeBrazilianMobile(phone ?? "");
}
