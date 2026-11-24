/**
 * Google Places API (New) — Text Search. Puro (sem I/O): monta o pedido,
 * lê a resposta e classifica o telefone. A chamada HTTP fica em
 * services/google-places.service.ts. Testado em
 * tests/google-places/places.test.ts (com respostas mock).
 *
 * Só a API oficial — nada de scraping do Google Maps.
 *
 * Termos da Google (Maps Platform ToS §3.2.3 e Service Specific Terms): o
 * place id pode ser guardado sem prazo; o resto do conteúdo do Places
 * (nome, endereço, telefone, site, categorias) não deve ser
 * guardado/cacheado fora do uso no serviço. Por isso: endereço, site,
 * categorias e link do Maps aparecem SÓ na prévia (não são gravados) e a
 * tela mostra a atribuição "Dados do Google".
 */

export const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** Só os campos que a prévia usa (o preço sai pelo campo mais caro:
 * telefone/site = SKU "Text Search Enterprise"). `nextPageToken` é
 * necessário pra paginar. */
export const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.websiteUri",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

/** A Text Search devolve no máximo 20 por página e 60 no total (3 páginas). */
export const PLACES_PAGE_SIZE = 20;
export const MAX_RESULTS_PER_SEARCH = 60;

/** Sugestões de categoria na tela (texto livre também vale). */
export const CATEGORY_SUGGESTIONS = [
  "hotéis",
  "pousadas",
  "restaurantes",
  "lanchonetes",
  "padarias",
  "clínicas",
  "dentistas",
  "salões de beleza",
  "barbearias",
  "academias",
  "pet shops",
  "oficinas mecânicas",
  "autopeças",
  "eletricistas",
  "encanadores",
  "pedreiros",
  "diaristas",
  "chaveiros",
  "contabilidade",
  "imobiliárias",
] as const;

export const BR_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface PlacesSearchInput {
  category: string;
  city: string;
  uf: string;
  /** 1..MAX_RESULTS_PER_SEARCH */
  limit: number;
}

/** "restaurantes em Curitiba - PR" — texto da busca enviado ao Google e
 * gravado no contato como origem da captação. */
export function buildSearchQuery(input: Pick<PlacesSearchInput, "category" | "city" | "uf">): string {
  const category = input.category.trim().replace(/\s+/g, " ");
  const city = input.city.trim().replace(/\s+/g, " ");
  const uf = input.uf.trim().toUpperCase();
  return `${category} em ${city}${uf ? ` - ${uf}` : ""}`;
}

export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return PLACES_PAGE_SIZE;
  return Math.min(MAX_RESULTS_PER_SEARCH, Math.max(1, Math.round(limit)));
}

/** Quantas chamadas (páginas) a busca faz no máximo — cada página é 1
 * evento cobrado do SKU Text Search Enterprise. */
export function estimateSearchCalls(limit: number): number {
  return Math.ceil(clampLimit(limit) / PLACES_PAGE_SIZE);
}

/** Corpo do POST places:searchText. */
export function buildTextSearchBody(textQuery: string, pageSize: number, pageToken?: string | null) {
  return {
    textQuery,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: Math.min(PLACES_PAGE_SIZE, Math.max(1, pageSize)),
    ...(pageToken ? { pageToken } : {}),
  };
}

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  nationalPhone: string | null;
  internationalPhone: string | null;
  primaryType: string | null;
  /** Rótulo legível da categoria (ex.: "Restaurante"). */
  categoryLabel: string | null;
  types: string[];
  websiteUri: string | null;
  googleMapsUri: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Lê a resposta da Text Search (tolerante a campos faltando). */
export function parseTextSearchResponse(json: unknown): { places: PlaceResult[]; nextPageToken: string | null } {
  if (!isRecord(json)) return { places: [], nextPageToken: null };
  const raw = Array.isArray(json.places) ? json.places : [];
  const places: PlaceResult[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const placeId = str(item.id);
    const name = isRecord(item.displayName) ? str(item.displayName.text) : null;
    if (!placeId || !name) continue;
    places.push({
      placeId,
      name: name.slice(0, 200),
      address: str(item.formattedAddress),
      nationalPhone: str(item.nationalPhoneNumber),
      internationalPhone: str(item.internationalPhoneNumber),
      primaryType: str(item.primaryType),
      categoryLabel: isRecord(item.primaryTypeDisplayName) ? str(item.primaryTypeDisplayName.text) : null,
      types: Array.isArray(item.types) ? item.types.filter((t): t is string => typeof t === "string") : [],
      websiteUri: str(item.websiteUri),
      googleMapsUri: str(item.googleMapsUri),
    });
  }
  return { places, nextPageToken: str(json.nextPageToken) };
}

/** Mensagem de erro da API do Google (corpo { error: { message, status } }). */
export function parsePlacesError(json: unknown): string | null {
  if (!isRecord(json) || !isRecord(json.error)) return null;
  return str(json.error.message) ?? str(json.error.status);
}

// --- Telefone ------------------------------------------------------------

export type BrPhoneKind = "mobile" | "landline";

export interface ClassifiedPhone {
  /** E.164 só dígitos, com 55 (ex.: 5541991234567 / 554133334444). */
  phone: string;
  kind: BrPhoneKind;
}

/**
 * Telefone do Google → formato do Mais Zap (55 + DDD + número) e se é
 * celular ou fixo. Não usa normalizeBrazilianMobile direto: aquela função
 * põe o 9 em QUALQUER número de 12 dígitos, o que transformaria um fixo
 * (55 41 3333-4444) num "celular" inexistente.
 *
 * - celular: DDD + 9 dígitos começando com 9;
 * - fixo: DDD + 8 dígitos começando com 2–5;
 * - DDD + 8 dígitos começando com 6–9: celular antigo sem o 9 → põe o 9;
 * - 0800/0300/4004/3003 etc. (sem DDD), outro país ou DDD inválido → null.
 */
export function classifyBrazilianPhone(national: string | null, international?: string | null): ClassifiedPhone | null {
  const fromInternational = international?.replace(/\D/g, "") ?? "";
  let digits: string | null = null;
  if (fromInternational) {
    if (!fromInternational.startsWith("55")) return null; // outro país
    digits = fromInternational.slice(2);
  } else if (national) {
    digits = national.replace(/\D/g, "").replace(/^0+/, "");
    // "0xx41..." (código de operadora): 0 + operadora (2) + DDD
    if (digits.length === 12 || digits.length === 13) digits = digits.slice(2);
  }
  if (!digits) return null;
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  const subscriber = digits.slice(2);
  if (subscriber.length === 9) {
    if (subscriber[0] !== "9") return null;
    return { phone: `55${ddd}${subscriber}`, kind: "mobile" };
  }
  const first = subscriber[0];
  if (first >= "2" && first <= "5") return { phone: `55${ddd}${subscriber}`, kind: "landline" };
  if (first >= "6" && first <= "9") return { phone: `55${ddd}9${subscriber}`, kind: "mobile" };
  return null;
}
