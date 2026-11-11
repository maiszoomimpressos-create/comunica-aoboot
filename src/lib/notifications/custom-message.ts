import { isMissingDetailValue } from "./detail-value";
import { buildGreeting, type GreetingStyle, type GreetingNameSource, type NotificationDetails } from "@/config/whatsapp-notification-types";

export const FIELD_VALUE_TYPES = ["texto", "numero", "moeda", "data_hora"] as const;
export type FieldValueType = (typeof FIELD_VALUE_TYPES)[number];

export const FIELD_VALUE_TYPE_LABELS: Record<FieldValueType, string> = {
  texto: "Texto",
  numero: "Número",
  moeda: "Moeda",
  data_hora: "Data e hora",
};

/** Shape stored in CustomNotificationType.fields JSON. `valueType` is optional
 * so records saved before it existed keep working (treated as "texto"). */
export interface CustomNotificationField {
  key: string;
  label: string;
  /** Short optional caption for editors; never used at send time. */
  description?: string;
  /** `false` = optional: the template line with `{{key}}` is dropped when
   * the value is missing. Absent or `true` = required. */
  required?: boolean;
  /** Guides the setup preview and the integration example. The public API
   * still sends all `details` as strings. */
  valueType?: FieldValueType;
}

/** Reserved placeholder for the business name, filled from the connection
 * at send time. Must never be declared in `fields`. */
export const RESERVED_TEMPLATE_KEYS = new Set(["nome_empresa"]);

export const SAMPLE_BUSINESS_NAME = "Loja Exemplo";
export const SAMPLE_WHATSAPP_NAME = "Ana";
export const SAMPLE_RECIPIENT_NAME = "Maria Silva";
export const SAMPLE_LINK_URL = "https://maidrive.com.br/tarifas";

export function normalizeValueType(value: unknown): FieldValueType {
  if (value === "numero" || value === "moeda" || value === "data_hora" || value === "texto") {
    return value;
  }
  return "texto";
}

export function inferValueType(key: string, label: string): FieldValueType {
  const hay = `${key} ${label}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/valor|preco|tarifa|total|pagamento|moeda/.test(hay)) return "moeda";
  if (/data|hora|horario|quando/.test(hay)) return "data_hora";
  if (/quantidade|distancia|km|numero/.test(hay)) return "numero";
  return "texto";
}

export function fieldLooksLikeLink(field: Pick<CustomNotificationField, "key" | "label">): boolean {
  const hay = `${field.key} ${field.label}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return hay.includes("link");
}

export function sampleValueForField(field: Pick<CustomNotificationField, "key" | "label" | "valueType">): string {
  if (fieldLooksLikeLink(field)) return SAMPLE_LINK_URL;
  const type = field.valueType ? normalizeValueType(field.valueType) : inferValueType(field.key, field.label);
  switch (type) {
    case "moeda":
      return "R$ 42,90";
    case "numero":
      return "12";
    case "data_hora":
      return "10/11/2026 às 14:30";
    default:
      if (/origem/.test(field.key.toLowerCase())) return "Centro";
      if (/destino/.test(field.key.toLowerCase())) return "Aeroporto";
      return `Exemplo de ${field.label || field.key}`;
  }
}

/** Valores sugeridos no payload de exemplo da API (formatos que o sistema de fora deve enviar). */
export function apiExampleValueForField(field: Pick<CustomNotificationField, "key" | "label" | "valueType">): string {
  if (fieldLooksLikeLink(field)) return SAMPLE_LINK_URL;
  const type = field.valueType ? normalizeValueType(field.valueType) : inferValueType(field.key, field.label);
  switch (type) {
    case "moeda":
      return "42.90";
    case "numero":
      return "12";
    case "data_hora":
      return "10/11/2026 14:30";
    default:
      return sampleValueForField(field);
  }
}

export function fieldFormatHint(field: Pick<CustomNotificationField, "key" | "label" | "valueType">): string {
  if (fieldLooksLikeLink(field)) {
    return "URL completa com https, ex.: https://maidrive.com.br/tarifas — o sistema de fora devolve esse link e envia neste campo.";
  }
  const type = field.valueType ? normalizeValueType(field.valueType) : inferValueType(field.key, field.label);
  switch (type) {
    case "moeda":
      return "Valor em reais, ex.: 42.90 ou R$ 42,90. O texto da mensagem usa o valor como enviado.";
    case "numero":
      return "Número, ex.: 12.";
    case "data_hora":
      return "ISO 8601 (2026-11-10T14:30:00-03:00) ou brasileiro dd/mm/aaaa hh:mm (10/11/2026 14:30). Prefira o formato que deve aparecer no WhatsApp — o valor é interpolado como texto.";
    default:
      return "Texto livre.";
  }
}

export function buildSampleDetails(fields: CustomNotificationField[]): NotificationDetails {
  const details: NotificationDetails = {};
  for (const field of fields) {
    if (!field.key.trim()) continue;
    details[field.key] = sampleValueForField(field);
  }
  return details;
}

export function normalizeTemplateNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Deterministic render used at send time and in the setup preview.
 * Optional fields drop their whole line when the value is missing — the
 * template is split on real newlines and blank lines are kept, never
 * collapsed. */
export function renderCustomMessageTemplate(
  messageTemplate: string,
  fields: CustomNotificationField[],
  details: NotificationDetails,
  businessName: string
): string {
  const values: NotificationDetails = { ...details, nome_empresa: businessName };
  const optionalKeys = new Set(fields.filter((f) => f.required === false).map((f) => f.key));
  const lines = normalizeTemplateNewlines(messageTemplate).split("\n").filter((line) => {
    const refs = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    return !refs.some((key) => optionalKeys.has(key) && isMissingDetailValue(values[key]));
  });
  const rendered = lines.map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]?.trim() ?? "")).join("\n");
  // Linhas opcionais removidas podem deixar linhas em branco seguidas; junta numa só.
  return rendered.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

const BOLD_LABEL_RE = /\*[^*\n]+:\*/;
const BOLD_LABEL_GLOBAL_RE = /[ \t]*(\*[^*\n]+:\*)/g;
const CAPITAL_AFTER_PLACEHOLDER_RE = /\}\}\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÜÄËÏÖÜÇ])/u;
const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÜÄËÏÖÜÇ])/u;
const LINK_SENTENCE_RE =
  /\b(acesse|clique aqui|veja em|confira em|saiba mais|para acompanhar|acompanhe em|acompanhe a)\b|\{\{\s*\w*link\w*\s*\}\}|https?:\/\/|\bwww\./i;
const CLOSING_SENTENCE_RE =
  /^(volte sempre|obrigad[oa]|até breve|ate breve|até logo|ate logo|qualquer dúvida|qualquer duvida|conte sempre|esperamos voc[eê]|até a próxima|ate a proxima)\b/i;

function isBoldLabelLine(line: string): boolean {
  return BOLD_LABEL_RE.test(line.trimStart());
}

function isLinkSentence(line: string): boolean {
  return LINK_SENTENCE_RE.test(line);
}

function isClosingSentence(line: string): boolean {
  return CLOSING_SENTENCE_RE.test(line.trim());
}

function splitOnCapitalAfterPlaceholder(line: string): string[] {
  const parts: string[] = [];
  let rest = line;
  let match: RegExpExecArray | null;
  const re = new RegExp(CAPITAL_AFTER_PLACEHOLDER_RE, "gu");
  while ((match = re.exec(rest))) {
    const cut = match.index + 2; // keep the closing }}
    const head = rest.slice(0, cut).trim();
    if (head) parts.push(head);
    rest = rest.slice(match.index + match[0].length);
    re.lastIndex = 0;
  }
  const tail = rest.trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [line.trim()].filter(Boolean);
}

function splitSentences(line: string): string[] {
  const pieces = line.split(SENTENCE_BOUNDARY_RE).map((s) => s.trim()).filter(Boolean);
  return pieces.length > 0 ? pieces : [line.trim()].filter(Boolean);
}

function explodeTemplateLines(text: string): string[] {
  const withLabelBreaks = text.replace(BOLD_LABEL_GLOBAL_RE, (match, label: string, offset: number) => {
    if (offset === 0 || text[offset - 1] === "\n") return label;
    return `\n${label}`;
  });
  const exploded: string[] = [];
  for (const raw of withLabelBreaks.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    for (const afterPlaceholder of splitOnCapitalAfterPlaceholder(trimmed)) {
      if (isBoldLabelLine(afterPlaceholder) && !isLinkSentence(afterPlaceholder)) {
        exploded.push(afterPlaceholder);
        continue;
      }
      for (const sentence of splitSentences(afterPlaceholder)) {
        exploded.push(sentence);
      }
    }
  }
  return exploded;
}

function formatDataBlock(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    if (isLinkSentence(line)) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(line);
      out.push("");
    } else {
      out.push(line);
    }
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/**
 * Reformats a custom-message template so each piece of information sits on
 * its own line: intro, then a data block of *Label:* lines, with link
 * sentences and a closing line separated by a blank line. Deterministic —
 * only rewrites editor text; the user still reviews and saves.
 */
export function formatTemplateOneItemPerLine(template: string): string {
  const text = normalizeTemplateNewlines(template).trim();
  if (!text) return text;

  const lines = explodeTemplateLines(text);
  const firstData = lines.findIndex((line) => isBoldLabelLine(line) || isLinkSentence(line));
  if (firstData === -1) {
    const closingAt = lines.findIndex((line) => isClosingSentence(line));
    if (closingAt <= 0) return lines.join("\n");
    const intro = lines.slice(0, closingAt).join("\n");
    const closing = lines.slice(closingAt).join("\n");
    return `${intro}\n\n${closing}`;
  }

  let lastData = firstData;
  for (let i = firstData; i < lines.length; i++) {
    if (isBoldLabelLine(lines[i]) || isLinkSentence(lines[i])) lastData = i;
  }

  // A trailing closing sentence after the last label/link belongs in the
  // closing block, even if it was left in the data range by mistake.
  while (lastData > firstData && isClosingSentence(lines[lastData])) {
    lastData -= 1;
  }

  const intro = lines.slice(0, firstData);
  const middle = lines.slice(firstData, lastData + 1);
  const closing = lines.slice(lastData + 1);
  const parts = [
    intro.length > 0 ? intro.join("\n") : "",
    formatDataBlock(middle),
    closing.length > 0 ? closing.join("\n") : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function buildCustomMessagePreview(input: {
  messageTemplate: string;
  fields: CustomNotificationField[];
  details: NotificationDetails;
  businessName: string;
  greetingStyle: GreetingStyle;
  greetingNameSource: GreetingNameSource;
  whatsappName: string | null;
  recipientName: string;
  whatsappNameOnly?: boolean;
}): string {
  const greeting = buildGreeting({
    style: input.greetingStyle,
    nameSource: input.greetingNameSource,
    whatsappName: input.whatsappName,
    recipientName: input.recipientName,
    details: input.details,
    fields: input.fields,
    whatsappNameOnly: input.whatsappNameOnly,
  });
  const body = renderCustomMessageTemplate(
    input.messageTemplate,
    input.fields,
    input.details,
    input.businessName
  );
  return body.trim() ? `${greeting}\n\n${body}` : greeting;
}

export function buildExampleApiPayload(input: {
  typeKey: string;
  fields: CustomNotificationField[];
  requiresQr: boolean;
  details?: NotificationDetails;
}): Record<string, unknown> {
  const details = input.details ?? buildSampleDetails(input.fields);
  const payload: Record<string, unknown> = {
    to: "5511999999999",
    type: input.typeKey,
    recipientName: SAMPLE_RECIPIENT_NAME,
    details,
  };
  if (input.requiresQr) {
    payload.qrData = "<codigo que vira QR>";
  }
  return payload;
}

export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  insertion: string
): { text: string; cursor: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const next = text.slice(0, from) + insertion + text.slice(to);
  return { text: next, cursor: from + insertion.length };
}

export function moveItem<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}