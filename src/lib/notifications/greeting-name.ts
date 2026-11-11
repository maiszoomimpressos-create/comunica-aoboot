/** Texto de ajuda do campo "Nome usado na saudação" — a ordem de resolução
 * é fixa no envio/prévia, independentemente da opção salva. */
export const GREETING_NAME_SOURCE_HELP =
  "A saudação usa só o primeiro nome (ex.: Maria Silva → Olá, *Maria*!). Ordem, independente desta opção: 1) nome enviado pelo sistema (recipientName ou um campo como nome_passageiro); 2) nome do perfil no WhatsApp, se estiver disponível; 3) sem nome válido → só “Olá!” / “Bom dia!”. Nomes que são só emoji, símbolo ou telefone são ignorados. No texto da mensagem, placeholders como {{nome_passageiro}} continuam com o nome completo.";

const TITLE_TOKENS = new Set([
  "sr",
  "sra",
  "srta",
  "dr",
  "dra",
  "prof",
  "profa",
  "sr.",
  "sra.",
  "srta.",
  "dr.",
  "dra.",
  "prof.",
  "profa.",
  "mr",
  "mrs",
  "ms",
  "miss",
  "mister",
]);

const PREFERRED_CLIENT_NAME_KEYS = [
  "nome_passageiro",
  "nome_cliente",
  "nome_destinatario",
  "nome_usuario",
  "nome_pessoa",
  "passenger_name",
  "customer_name",
  "recipient_name",
  "nome",
  "name",
] as const;

/** Palavras que o sistema de fora manda no lugar do nome ("Passageiro",
 * "Cliente"...) — nunca viram saudação; cai no nome do WhatsApp ou em "Olá!". */
const GENERIC_NAME_TOKENS = new Set([
  "passageiro",
  "passageira",
  "cliente",
  "clientes",
  "usuario",
  "usuaria",
  "destinatario",
  "destinataria",
  "consumidor",
  "consumidora",
  "comprador",
  "compradora",
  "contato",
  "pessoa",
  "nome",
  "customer",
  "client",
  "user",
  "passenger",
  "recipient",
  "desconhecido",
  "desconhecida",
  "anonimo",
  "anonima",
  "sem",
  "nao",
  "informado",
  "informada",
  "n/a",
  "do",
  "da",
  "de",
]);

const BLOCKED_NAME_FIELD = /empresa|motorista|loja|negocio|estabelecimento|business|driver|comercio/;

export interface GreetingNameField {
  key: string;
  label?: string;
}

function foldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function hasLetter(value: string): boolean {
  return /\p{L}/u.test(value);
}

/** Telefone formatado ou composto praticamente só de dígitos (ex. Z-API
 * devolve o próprio número quando não há nome). */
export function looksLikePhoneName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[+\d][\d\s\-().]*$/.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    const significant = trimmed.replace(/\s/g, "").length;
    if (digits.length >= significant - 2) return true;
  }
  return false;
}

function titleCaseNamePart(part: string): string {
  const lower = part.toLocaleLowerCase("pt-BR");
  const chars = [...lower];
  const index = chars.findIndex((char) => /\p{L}/u.test(char));
  if (index < 0) return part;
  chars[index] = chars[index].toLocaleUpperCase("pt-BR");
  return chars.join("");
}

function titleCaseNameWord(word: string): string {
  return word
    .split("-")
    .map((segment) => segment.split(/['’]/).map(titleCaseNamePart).join("'"))
    .join("-");
}

function stripOuterNonLetters(token: string): string {
  return token.replace(/^[^\p{L}'’-]+|[^\p{L}'’-]+$/gu, "");
}

function isHonorific(token: string): boolean {
  const lower = token.toLocaleLowerCase("pt-BR");
  if (TITLE_TOKENS.has(lower)) return true;
  return TITLE_TOKENS.has(foldKey(token));
}

/** Extrai o primeiro nome utilizável e capitaliza (MARIA SILVA / maria silva → Maria).
 * Ignora títulos (Sra., Dr.), tokens só de emoji/símbolo e valores que parecem telefone. */
export function extractGreetingFirstName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (looksLikePhoneName(trimmed)) return null;
  if (!hasLetter(trimmed)) return null;

  for (const token of trimmed.split(" ")) {
    if (!token || isHonorific(token) || !hasLetter(token) || looksLikePhoneName(token)) continue;
    const letters = token.match(/\p{L}/gu)?.length ?? 0;
    const digits = token.match(/\d/g)?.length ?? 0;
    if (digits > 0 && digits >= letters) continue;
    const cleaned = stripOuterNonLetters(token);
    if (!cleaned || !hasLetter(cleaned) || looksLikePhoneName(cleaned)) continue;
    if (GENERIC_NAME_TOKENS.has(foldKey(cleaned))) continue;
    const pretty = titleCaseNameWord(cleaned);
    if (pretty) return pretty;
  }
  return null;
}

export function isUsablePersonName(raw: string | null | undefined): boolean {
  return extractGreetingFirstName(raw) !== null;
}

export function isRecipientNameField(key: string, label?: string): boolean {
  const foldedKey = foldKey(key);
  const foldedLabel = foldKey(label ?? "");
  const hay = `${foldedKey} ${foldedLabel}`.trim();
  if (!foldedKey && !foldedLabel) return false;
  if (BLOCKED_NAME_FIELD.test(hay)) return false;
  if ((PREFERRED_CLIENT_NAME_KEYS as readonly string[]).includes(foldedKey)) return true;
  if (/^nome_(passageiro|cliente|destinatario|usuario|pessoa)$/.test(foldedKey)) return true;
  if (/(passageiro|cliente|destinatario|usuario)/.test(foldedKey) && /nome|name/.test(foldedKey)) {
    return true;
  }
  if (
    foldedLabel &&
    /^nome(\s+d[oa])?\s+(passageiro|cliente|destinatario|usuario|pessoa)\b/.test(foldedLabel)
  ) {
    return true;
  }
  return false;
}

/** Nome completo enviado pelo sistema cliente, se for utilizável — ainda
 * não reduz ao primeiro nome (isso é feito em `resolveGreetingFirstName`). */
export function resolveClientProvidedName(
  recipientName: string | null | undefined,
  details?: Record<string, string>,
  fields?: GreetingNameField[]
): string | null {
  if (isUsablePersonName(recipientName)) return recipientName!.trim();

  if (details) {
    for (const key of PREFERRED_CLIENT_NAME_KEYS) {
      const value = details[key];
      if (isUsablePersonName(value)) return value.trim();
    }
    if (fields) {
      for (const field of fields) {
        if (!isRecipientNameField(field.key, field.label)) continue;
        const value = details[field.key];
        if (isUsablePersonName(value)) return value.trim();
      }
    }
  }
  return null;
}

/** Ordem fixa: 1) nome do sistema cliente, 2) perfil do WhatsApp, 3) nenhum. */
export function resolveGreetingFirstName(input: {
  recipientName?: string | null;
  whatsappName?: string | null;
  details?: Record<string, string>;
  fields?: GreetingNameField[];
  /** Quando true (envio de teste), ignora o nome de exemplo/cliente e usa só o perfil do WhatsApp. */
  whatsappNameOnly?: boolean;
}): string | null {
  if (input.whatsappNameOnly) {
    return extractGreetingFirstName(input.whatsappName);
  }
  const client = resolveClientProvidedName(input.recipientName, input.details, input.fields);
  const fromClient = extractGreetingFirstName(client);
  if (fromClient) return fromClient;
  return extractGreetingFirstName(input.whatsappName);
}
