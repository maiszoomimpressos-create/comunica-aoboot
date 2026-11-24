/**
 * Sequência de mensagens de uma campanha ("partes") — puro (sem I/O),
 * usado pelo dispatcher, pela criação da campanha e pela prévia no painel.
 * Testado em tests/campaigns/sequence.test.ts.
 *
 * Uma campanha tem de 1 a MAX_CAMPAIGN_PARTS partes, enviadas em ordem pra
 * cada destinatário (a sequência inteira antes do próximo destinatário),
 * com um intervalo aleatório curto entre partes. Cada parte é:
 * - text: só texto;
 * - image / video / document: mídia com legenda opcional (a regra de
 *   legenda longa vale por parte — ver caption.ts);
 * - audio: só o áudio (o WhatsApp não tem legenda em áudio).
 * Todos os textos aceitam variáveis e variação (template.ts).
 */
import { appendOptOutFooter, findUnknownVariables, renderSpintax, renderVariables } from "./template";
import type { CampaignTemplateContext } from "./template";

export const CAMPAIGN_PART_TYPES = ["text", "image", "video", "document", "audio"] as const;

export type CampaignPartType = (typeof CAMPAIGN_PART_TYPES)[number];

export interface CampaignPart {
  type: CampaignPartType;
  /** Texto (parte "text") ou legenda (mídia). Áudio: sempre null. */
  text: string | null;
  mediaUrl: string | null;
  /** Só documento: nome do arquivo como o contato vê (com extensão). */
  fileName: string | null;
}

export const MAX_CAMPAIGN_PARTS = 5;
export const PART_TEXT_MAX_LENGTH = 4000;
export const DEFAULT_PART_INTERVAL = { min: 3, max: 6 } as const;
/** Intervalo entre partes aceito no painel (segundos). */
export const PART_INTERVAL_LIMITS = { min: 1, max: 30 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function partSupportsText(type: CampaignPartType): boolean {
  return type !== "audio";
}

/** Normaliza o JSON gravado em Campaign.parts (ignora lixo). */
export function parseStoredParts(raw: unknown): CampaignPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: CampaignPart[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = item.type;
    if (typeof type !== "string" || !(CAMPAIGN_PART_TYPES as readonly string[]).includes(type)) continue;
    const partType = type as CampaignPartType;
    parts.push({
      type: partType,
      text: partSupportsText(partType) ? str(item.text) : null,
      mediaUrl: partType === "text" ? null : str(item.mediaUrl),
      fileName: partType === "document" ? str(item.fileName) : null,
    });
  }
  return parts;
}

/**
 * Partes de uma campanha. Campanhas criadas antes das partes existirem
 * (Campaign.parts vazio) viram a sequência equivalente ao comportamento
 * antigo: texto puro → [texto]; imagem/vídeo/documento → [mídia com o
 * texto de legenda]; áudio → [áudio, texto] (o envio antigo já mandava o
 * texto logo depois do áudio).
 */
export function partsFromCampaign(campaign: {
  parts: unknown;
  messageText: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaFileName: string | null;
}): CampaignPart[] {
  const stored = parseStoredParts(campaign.parts);
  if (stored.length > 0) return stored;

  const text = str(campaign.messageText);
  const url = str(campaign.mediaUrl);
  const type = campaign.mediaType;
  if (!url || !type || !["image", "video", "document", "audio"].includes(type)) {
    return [{ type: "text", text: text ?? "", mediaUrl: null, fileName: null }];
  }
  if (type === "audio") {
    const audio: CampaignPart = { type: "audio", text: null, mediaUrl: url, fileName: null };
    return text ? [audio, { type: "text", text, mediaUrl: null, fileName: null }] : [audio];
  }
  return [
    {
      type: type as CampaignPartType,
      text,
      mediaUrl: url,
      fileName: type === "document" ? (campaign.mediaFileName ?? "arquivo.pdf") : null,
    },
  ];
}

/** Erro (pt-BR) da primeira parte inválida, ou null se tudo certo. */
export function validateParts(parts: CampaignPart[]): string | null {
  if (parts.length === 0) return "Adicione pelo menos uma mensagem.";
  if (parts.length > MAX_CAMPAIGN_PARTS) return `No máximo ${MAX_CAMPAIGN_PARTS} mensagens por campanha.`;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const label = `Mensagem ${i + 1}`;
    if (part.type === "text" && !part.text?.trim()) return `${label}: escreva o texto.`;
    if (part.text && part.text.length > PART_TEXT_MAX_LENGTH) {
      return `${label}: no máximo ${PART_TEXT_MAX_LENGTH} caracteres.`;
    }
    if (part.text) {
      const unknown = findUnknownVariables(part.text);
      if (unknown.length > 0) return `${label}: variável desconhecida ${unknown.map((v) => `{{${v}}}`).join(", ")}.`;
    }
    if (part.type !== "text") {
      if (!part.mediaUrl) return `${label}: envie o arquivo ou informe a URL.`;
      let url: URL;
      try {
        url = new URL(part.mediaUrl);
      } catch {
        return `${label}: URL da mídia inválida.`;
      }
      if (url.protocol !== "https:") return `${label}: a URL da mídia precisa começar com https://.`;
    }
    if (part.type === "document" && !/\.[a-z0-9]{2,5}$/i.test(part.fileName?.trim() ?? "")) {
      return `${label}: informe o nome do arquivo com a extensão (ex.: catalogo.pdf).`;
    }
  }
  return null;
}

/** Junta os textos das partes — gravado em Campaign.messageText (resumo pra
 * telas antigas, busca e o filtro "usa {{nome}}?"). */
export function summarizePartsText(parts: CampaignPart[]): string {
  return parts
    .map((p) => p.text?.trim())
    .filter((t): t is string => !!t)
    .join("\n\n");
}

export interface RenderedPart {
  index: number;
  type: CampaignPartType;
  /** Texto final (variáveis + variação + rodapé, quando for o caso). */
  text: string;
  mediaUrl: string | null;
  fileName: string | null;
}

/**
 * Monta a sequência final de UM destinatário. O rodapé de descadastro vai
 * na ÚLTIMA parte que aceita texto (texto ou legenda) — a não ser que
 * alguma parte já fale em "SAIR"; se nenhuma parte aceita texto (só
 * áudios), o rodapé vira uma parte de texto extra no fim.
 */
export function renderSequence(
  parts: CampaignPart[],
  ctx: CampaignTemplateContext,
  footer: string | null,
  rng: () => number = Math.random
): RenderedPart[] {
  const rendered: RenderedPart[] = parts.map((part, index) => ({
    index,
    type: part.type,
    text: part.text ? renderSpintax(renderVariables(part.text, ctx), rng).trim() : "",
    mediaUrl: part.mediaUrl,
    fileName: part.fileName,
  }));

  const trimmedFooter = footer?.trim();
  if (!trimmedFooter) return rendered;
  if (rendered.some((p) => /\bSAIR\b/i.test(p.text))) return rendered;

  for (let i = rendered.length - 1; i >= 0; i--) {
    if (partSupportsText(rendered[i].type)) {
      rendered[i] = { ...rendered[i], text: appendOptOutFooter(rendered[i].text, trimmedFooter) };
      return rendered;
    }
  }
  rendered.push({ index: rendered.length, type: "text", text: trimmedFooter, mediaUrl: null, fileName: null });
  return rendered;
}

// --- Tempo ---------------------------------------------------------------

/** Tempo típico de uma chamada à Z-API (resposta, não entrega). */
export const PART_SEND_ESTIMATE_MS = 2_000;
/** Checagens antes da 1ª parte (phone-exists e, se preciso, o nome). */
export const PRECHECK_ESTIMATE_MS = 2_000;
/** Folga pra um timeout no meio (o maxDuration da rota é 60 s e o
 * orçamento padrão 45 s — sobra margem pro último envio terminar). */
export const SEQUENCE_SAFETY_MS = 8_000;

/** Quanto deve levar mandar `remainingParts` partes (pior caso de
 * intervalo entre partes), começando agora. */
export function estimateSequenceMs(
  remainingParts: number,
  maxPartIntervalSeconds: number,
  includePrecheck: boolean
): number {
  if (remainingParts <= 0) return 0;
  return (
    (includePrecheck ? PRECHECK_ESTIMATE_MS : 0) +
    remainingParts * PART_SEND_ESTIMATE_MS +
    (remainingParts - 1) * maxPartIntervalSeconds * 1000 +
    SEQUENCE_SAFETY_MS
  );
}

/** Só começa (ou retoma) a sequência de um destinatário se ela couber
 * inteira antes do fim do orçamento desta execução. */
export function canStartSequence(
  nowMs: number,
  deadlineMs: number,
  remainingParts: number,
  maxPartIntervalSeconds: number,
  includePrecheck: boolean
): boolean {
  return nowMs + estimateSequenceMs(remainingParts, maxPartIntervalSeconds, includePrecheck) <= deadlineMs;
}

/** No meio da sequência: ainda dá pra esperar `gapSeconds` e mandar a
 * próxima parte? (Só falha se algo demorou muito mais que o estimado —
 * aí a sequência para e a próxima execução continua da parte que faltou.) */
export function canContinueSequence(nowMs: number, deadlineMs: number, gapSeconds: number): boolean {
  // A próxima parte precisa COMEÇAR até o fim do orçamento: o resto do
  // maxDuration da rota (60 s − 45 s) cobre o timeout de 15 s da Z-API.
  // Como a sequência só começa se couber com folga (SEQUENCE_SAFETY_MS),
  // isso só barra quando a Z-API está bem mais lenta que o normal — aí a
  // parte que faltou sai na próxima execução, sem repetir as anteriores.
  return nowMs + gapSeconds * 1000 <= deadlineMs;
}

/** A sequência cabe numa execução vazia? (validação na criação). */
export function sequenceFitsBudget(partsCount: number, maxPartIntervalSeconds: number, budgetMs: number): boolean {
  return estimateSequenceMs(partsCount, maxPartIntervalSeconds, true) <= budgetMs;
}

/** Maior intervalo entre partes que ainda cabe no orçamento. */
export function maxPartIntervalForBudget(partsCount: number, budgetMs: number): number {
  if (partsCount <= 1) return PART_INTERVAL_LIMITS.max;
  const fixed = PRECHECK_ESTIMATE_MS + partsCount * PART_SEND_ESTIMATE_MS + SEQUENCE_SAFETY_MS;
  return Math.max(0, Math.floor((budgetMs - fixed) / ((partsCount - 1) * 1000)));
}

export function pickPartGapSeconds(min: number, max: number, rng: () => number = Math.random): number {
  if (max <= min) return Math.max(0, min);
  return min + Math.floor(rng() * (max - min + 1));
}

// --- Retomada ----------------------------------------------------------------

/** Ids de mensagem por parte já enviada (CampaignRecipient.partMessageIds). */
export function parsePartMessageIds(raw: unknown): (string | null)[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "string" && v ? v : null));
}

export function withPartMessageId(raw: unknown, index: number, messageId: string | null): (string | null)[] {
  const ids = parsePartMessageIds(raw);
  while (ids.length <= index) ids.push(null);
  ids[index] = messageId;
  return ids;
}

/** Partes que ainda faltam pra este destinatário (a partir de
 * nextPartIndex), já renderizadas. */
export function remainingParts(rendered: RenderedPart[], nextPartIndex: number): RenderedPart[] {
  return rendered.slice(Math.max(0, nextPartIndex));
}
