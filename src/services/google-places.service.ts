import {
  buildTextSearchBody,
  clampLimit,
  parsePlacesError,
  parseTextSearchResponse,
  PLACES_PAGE_SIZE,
  PLACES_TEXT_SEARCH_URL,
  TEXT_SEARCH_FIELD_MASK,
  type PlaceResult,
} from "@/lib/google-places/places";
import { ConflictError, ValidationError } from "@/lib/server/errors";

/** Chave da Places API (New), só no servidor. Sem ela a tela de captação
 * fica desabilitada. */
export function getGooglePlacesApiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export function isGooglePlacesConfigured(): boolean {
  return getGooglePlacesApiKey() !== null;
}

const REQUEST_TIMEOUT_MS = 15_000;

export interface SearchPlacesResult {
  places: PlaceResult[];
  /** Chamadas feitas de verdade (páginas) — cada uma é cobrada. */
  calls: number;
}

/**
 * Text Search paginada (até `limit`, no máximo 60 / 3 páginas). `fetchImpl`
 * só existe pros testes (mock) — em produção usa o fetch global.
 */
export async function searchPlacesByText(
  textQuery: string,
  limit: number,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch } = {}
): Promise<SearchPlacesResult> {
  const apiKey = options.apiKey === undefined ? getGooglePlacesApiKey() : options.apiKey;
  if (!apiKey) throw new ConflictError("A captação do Google não está configurada (falta GOOGLE_PLACES_API_KEY).");
  const query = textQuery.trim();
  if (!query) throw new ValidationError("Informe a categoria e a cidade.");
  const doFetch = options.fetchImpl ?? fetch;
  const max = clampLimit(limit);

  const places: PlaceResult[] = [];
  const seen = new Set<string>();
  let pageToken: string | null = null;
  let calls = 0;
  do {
    const remaining = max - places.length;
    const response = await doFetch(PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(buildTextSearchBody(query, Math.min(PLACES_PAGE_SIZE, remaining), pageToken)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    calls++;
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = parsePlacesError(json) ?? `HTTP ${response.status}`;
      throw new ConflictError(`A busca no Google falhou: ${message}`);
    }
    const page = parseTextSearchResponse(json);
    for (const place of page.places) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      places.push(place);
      if (places.length >= max) break;
    }
    pageToken = page.nextPageToken;
  } while (pageToken && places.length < max && calls < Math.ceil(max / PLACES_PAGE_SIZE));

  return { places, calls };
}
