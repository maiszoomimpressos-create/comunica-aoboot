import { z } from "zod";
import {
  getEnabledBusinessIntegration,
  cacheBusinessIntegrationCatalog,
  type BusinessIntegrationCredentials,
} from "@/repositories/business-integration.repository";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

// Cache TTL pro catálogo (GET /catalogo) — ver docs/INTEGRACAO-MAIDRIVE.md:
// não bater no MAI Drive a cada mensagem. Sem indicação ainda de que o
// catálogo muda com frequência; 10 min é um ponto de partida conservador,
// não um número confirmado com o MAI Drive.
const CATALOG_TTL_MS = 10 * 60 * 1000;

/** Shape de UMA função do catálogo — confirmado contra o doc real do lado
 * MAI Drive (docs/BRIEFING-INTEGRACAO-MAIDRIVE.md, resposta de 25/10/2026):
 * campos em português (`nome`, `descricao`, `parametros`), `parametros` em
 * JSON Schema de verdade (não um mapa plano chave->tipo), e `ativo`
 * controlando se a função já pode ser chamada ou ainda devolve 501. */
const catalogEntrySchema = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
  path: z.string().optional(),
  parametros: z.record(z.string(), z.unknown()).optional(),
  versao: z.string().optional(),
  ativo: z.boolean().default(true),
});

/** O MAI Drive ainda não fechou se o campo oficial da lista é `funcoes` ou
 * `functions` (commit `7ce933d` do lado deles passou a devolver os dois) —
 * aceita qualquer um dos dois até isso ser confirmado, em vez de travar a
 * integração numa decisão de nome de campo. */
const catalogOkSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    funcoes: z.array(catalogEntrySchema).optional(),
    functions: z.array(catalogEntrySchema).optional(),
  }),
});

const catalogErrSchema = z.object({
  ok: z.literal(false),
  erro: z.object({ codigo: z.string(), mensagem: z.string().optional() }),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

/** Busca `/catalogo` fresco (sem cache), valida o envelope `{ok, data}`/
 * `{ok, erro}` e devolve só as funções com `ativo: true` — uma função
 * `ativo: false` existe no catálogo mas responde 501 se chamada (ver
 * tabela de erros do doc), então não serve pra virar ferramenta de IA
 * ainda. `null` em qualquer falha (rede, formato inválido, `ok: false`)
 * — quem chama decide o fallback (ver getCachedOrFreshCatalog). Erros
 * `ok: false` são logados com o `codigo` (ex: `CHAVE_INVALIDA`,
 * `LIMITE_EXCEDIDO`) pra dar visibilidade sem travar a resposta ao
 * cliente. */
async function fetchCatalog(credentials: BusinessIntegrationCredentials): Promise<CatalogEntry[] | null> {
  const url = `${credentials.baseUrl}/catalogo`;
  await logBotEvent("info", "mai_drive_request", {
    connectionId: credentials.id,
    method: "GET",
    url,
  });

  try {
    const response = await fetch(url, {
      headers: { "x-api-key": credentials.apiKey },
    });
    const body = await response.json().catch(() => null);

    await logBotEvent("info", "mai_drive_response", {
      connectionId: credentials.id,
      method: "GET",
      url,
      status: response.status,
      body,
    });

    if (!body) return null;

    const err = catalogErrSchema.safeParse(body);
    if (err.success) {
      await logBotEvent("warn", "mai_drive_catalog_error", {
        connectionId: credentials.id,
        codigo: err.data.erro.codigo,
      });
      return null;
    }

    const ok = catalogOkSchema.safeParse(body);
    if (!ok.success) return null;

    const entries = ok.data.data.funcoes ?? ok.data.data.functions ?? [];
    return entries.filter((entry) => entry.ativo);
  } catch (err) {
    await logBotEvent("error", "mai_drive_request_failed", {
      connectionId: credentials.id,
      method: "GET",
      url,
      error: serializeError(err),
    });
    return null;
  }
}

/** Entry point pro buildTools dinâmico (bot-attendant.service.ts): usa o
 * catálogo cacheado se ainda dentro do TTL, senão busca fresco e cacheia.
 * Se a busca fresca falhar, cai pro cache antigo (ainda que vencido) em vez
 * de ficar sem nenhuma ferramenta — degrada pra "informação levemente
 * desatualizada" em vez de "bot sem conseguir oferecer o serviço". Volta
 * `[]` só quando nunca houve cache nenhum E a busca fresca falhou.
 *
 * O cache (`catalogJson`) guarda o array de `CatalogEntry` já filtrado
 * (só `ativo: true`), não o envelope bruto da API — evita refazer a
 * validação do envelope a cada leitura do cache. */
export async function getCachedOrFreshCatalog(connectionId: string): Promise<CatalogEntry[]> {
  const credentials = await getEnabledBusinessIntegration(connectionId);
  if (!credentials) return [];

  const cachedEntriesSchema = z.array(catalogEntrySchema);

  const isFresh =
    credentials.catalogFetchedAt && Date.now() - credentials.catalogFetchedAt.getTime() < CATALOG_TTL_MS;
  if (isFresh) {
    const cached = cachedEntriesSchema.safeParse(credentials.catalogJson);
    if (cached.success) return cached.data;
  }

  const fresh = await fetchCatalog(credentials);
  if (fresh) {
    await cacheBusinessIntegrationCatalog(credentials.id, fresh);
    return fresh;
  }

  // Busca fresca falhou — cai pro cache antigo (vencido ou não) em vez de
  // devolver vazio, se houver algo salvo.
  const stale = cachedEntriesSchema.safeParse(credentials.catalogJson);
  return stale.success ? stale.data : [];
}
