import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchQuery,
  buildTextSearchBody,
  classifyBrazilianPhone,
  estimateSearchCalls,
  parsePlacesError,
  parseTextSearchResponse,
  TEXT_SEARCH_FIELD_MASK,
} from "@/lib/google-places/places";
import { searchPlacesByText } from "@/services/google-places.service";

/** Resposta no formato da Places API (New) Text Search. */
function mockPlace(id: string, name: string, phone: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayName: { text: name, languageCode: "pt-BR" },
    formattedAddress: "R. XV de Novembro, 100 - Centro, Curitiba - PR, 80020-310, Brasil",
    ...(phone ? { nationalPhoneNumber: phone, internationalPhoneNumber: `+55 ${phone.replace(/[()]/g, "")}` } : {}),
    types: ["restaurant", "food", "point_of_interest", "establishment"],
    primaryType: "restaurant",
    primaryTypeDisplayName: { text: "Restaurante", languageCode: "pt-BR" },
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    ...extra,
  };
}

test("parser lê os campos pedidos e ignora itens sem id/nome", () => {
  const parsed = parseTextSearchResponse({
    places: [
      mockPlace("p1", "Restaurante Sabor", "(41) 99123-4567", { websiteUri: "https://sabor.com.br" }),
      { id: "sem-nome" },
      { displayName: { text: "sem id" } },
      "lixo",
    ],
    nextPageToken: "tok-2",
  });
  assert.equal(parsed.places.length, 1);
  const p = parsed.places[0];
  assert.equal(p.placeId, "p1");
  assert.equal(p.name, "Restaurante Sabor");
  assert.equal(p.nationalPhone, "(41) 99123-4567");
  assert.equal(p.internationalPhone, "+55 41 99123-4567");
  assert.equal(p.categoryLabel, "Restaurante");
  assert.equal(p.primaryType, "restaurant");
  assert.equal(p.websiteUri, "https://sabor.com.br");
  assert.equal(parsed.nextPageToken, "tok-2");
});

test("parser tolera resposta vazia / sem places", () => {
  assert.deepEqual(parseTextSearchResponse({}), { places: [], nextPageToken: null });
  assert.deepEqual(parseTextSearchResponse(null), { places: [], nextPageToken: null });
  assert.equal(parsePlacesError({ error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED" } }), "API key not valid");
});

test("FieldMask pede só o necessário (e o token de página)", () => {
  const fields = TEXT_SEARCH_FIELD_MASK.split(",");
  for (const f of ["places.id", "places.displayName", "places.nationalPhoneNumber", "places.internationalPhoneNumber", "nextPageToken"]) {
    assert.ok(fields.includes(f), f);
  }
  assert.ok(!fields.includes("places.reviews"));
  assert.ok(!fields.includes("*"));
});

test("query e corpo do pedido", () => {
  assert.equal(buildSearchQuery({ category: "  oficinas  mecânicas ", city: "Ponta Grossa", uf: "pr" }), "oficinas mecânicas em Ponta Grossa - PR");
  assert.deepEqual(buildTextSearchBody("x", 50, "tok"), { textQuery: "x", languageCode: "pt-BR", regionCode: "BR", pageSize: 20, pageToken: "tok" });
  assert.equal(estimateSearchCalls(20), 1);
  assert.equal(estimateSearchCalls(21), 2);
  assert.equal(estimateSearchCalls(500), 3); // teto de 60 resultados
});

// --- Telefone ------------------------------------------------------------

test("celular x fixo, sempre com 55", () => {
  assert.deepEqual(classifyBrazilianPhone("(41) 99123-4567"), { phone: "5541991234567", kind: "mobile" });
  assert.deepEqual(classifyBrazilianPhone("(41) 3333-4444"), { phone: "554133334444", kind: "landline" });
  // fixo NÃO ganha o 9 (normalizeBrazilianMobile poria)
  assert.deepEqual(classifyBrazilianPhone(null, "+55 11 2345-6789"), { phone: "551123456789", kind: "landline" });
  assert.deepEqual(classifyBrazilianPhone(null, "+55 21 98888-7777"), { phone: "5521988887777", kind: "mobile" });
  // celular antigo sem o 9
  assert.deepEqual(classifyBrazilianPhone("(46) 8821-2387"), { phone: "5546988212387", kind: "mobile" });
  // com zero de longa distância
  assert.deepEqual(classifyBrazilianPhone("041 3333-4444"), { phone: "554133334444", kind: "landline" });
});

test("números que não servem ficam de fora", () => {
  assert.equal(classifyBrazilianPhone("0800 123 4567"), null);
  assert.equal(classifyBrazilianPhone("4004-1234"), null);
  assert.equal(classifyBrazilianPhone(null, "+1 650-253-0000"), null);
  assert.equal(classifyBrazilianPhone(null, "+55 800 123 4567"), null);
  assert.equal(classifyBrazilianPhone(null, null), null);
  assert.equal(classifyBrazilianPhone("(41) 1234-5678"), null); // fixo começa com 2–5
});

// --- Serviço com fetch mock (nenhuma chamada real) -----------------------

test("busca pagina até o limite, manda chave/FieldMask no header e não passa de 3 páginas", async () => {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const pages = [
    { places: Array.from({ length: 20 }, (_, i) => mockPlace(`a${i}`, `Lugar ${i}`, "(41) 99123-4567")), nextPageToken: "t2" },
    { places: Array.from({ length: 20 }, (_, i) => mockPlace(`b${i}`, `Lugar B${i}`, "(41) 3333-4444")), nextPageToken: "t3" },
    { places: Array.from({ length: 20 }, (_, i) => mockPlace(`c${i}`, `Lugar C${i}`, null)), nextPageToken: "t4" },
    { places: [mockPlace("d0", "Não deveria", null)] },
  ];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await searchPlacesByText("restaurantes em Curitiba - PR", 60, { apiKey: "test-key", fetchImpl });
  assert.equal(result.calls, 3);
  assert.equal(result.places.length, 60);
  assert.equal(calls[0].url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(calls[0].headers["X-Goog-Api-Key"], "test-key");
  assert.equal(calls[0].headers["X-Goog-FieldMask"], TEXT_SEARCH_FIELD_MASK);
  assert.equal(calls[0].body.pageToken, undefined);
  assert.equal(calls[1].body.pageToken, "t2");
});

test("busca com limite 25 faz 2 chamadas e corta em 25", async () => {
  let n = 0;
  const fetchImpl = (async () => {
    n++;
    const places = Array.from({ length: 20 }, (_, i) => mockPlace(`p${n}-${i}`, `L${i}`, "(41) 99123-4567"));
    return new Response(JSON.stringify({ places, nextPageToken: "next" }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await searchPlacesByText("x", 25, { apiKey: "k", fetchImpl });
  assert.equal(result.calls, 2);
  assert.equal(result.places.length, 25);
});

test("sem chave não chama nada; erro da API vira mensagem", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response("{}");
  }) as unknown as typeof fetch;
  await assert.rejects(searchPlacesByText("x", 10, { apiKey: null, fetchImpl: spy }), /GOOGLE_PLACES_API_KEY/);
  assert.equal(called, false);

  const failing = (async () =>
    new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(searchPlacesByText("x", 10, { apiKey: "k", fetchImpl: failing }), /API key not valid/);
});
