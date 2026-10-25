import { z } from "zod";
import {
  getEnabledBusinessIntegration,
  cacheBusinessIntegrationCatalog,
  type BusinessIntegrationCredentials,
} from "@/repositories/business-integration.repository";

// Cache TTL pro catálogo (GET /catalogo) — ver docs/INTEGRACAO-MAIDRIVE.md:
// não bater no MAI Drive a cada mensagem. Sem indicação ainda de que o
// catálogo muda com frequência; 10 min é um ponto de partida conservador,
// não um número confirmado com o MAI Drive.
const CATALOG_TTL_MS = 10 * 60 * 1000;

/** Shape de UMA função do catálogo — PROVISÓRIO. O contrato combinado
 * (docs/INTEGRACAO-MAIDRIVE.md) especifica que `/catalogo` devolve "nome,
 * descrição, parâmetros", mas não como invocar a função descoberta (método
 * HTTP + rota) nem o nome exato do envelope de resposta. `method`/`path`
 * aqui são um palpite de como isso provavelmente vai ficar — não confirmado
 * contra uma resposta real do MAI Drive ainda. Revisar assim que o endpoint
 * existir de verdade. */
const catalogEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  method: z.enum(["GET", "POST"]).optional(),
  path: z.string().optional(),
});

const catalogResponseSchema = z.object({
  functions: z.array(catalogEntrySchema),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

/** Busca `/catalogo` fresco (sem cache) e valida o formato antes de
 * devolver — nunca deixa uma resposta inesperada do MAI Drive virar
 * definição de ferramenta de IA sem checar (ver guardrails no doc).
 * `null` em qualquer falha (rede, formato inválido, não-200) — quem chama
 * decide o fallback (ver getCachedOrFreshCatalog). */
async function fetchCatalog(credentials: BusinessIntegrationCredentials): Promise<CatalogEntry[] | null> {
  try {
    const response = await fetch(`${credentials.baseUrl}/catalogo`, {
      headers: { "x-api-key": credentials.apiKey },
    });
    if (!response.ok) return null;

    const parsed = catalogResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.functions;
  } catch {
    return null;
  }
}

/** Entry point pro buildTools dinâmico (bot-attendant.service.ts): usa o
 * catálogo cacheado se ainda dentro do TTL, senão busca fresco e cacheia.
 * Se a busca fresca falhar, cai pro cache antigo (ainda que vencido) em vez
 * de ficar sem nenhuma ferramenta — degrada pra "informação levemente
 * desatualizada" em vez de "bot sem conseguir oferecer o serviço". Volta
 * `[]` só quando nunca houve cache nenhum E a busca fresca falhou. */
export async function getCachedOrFreshCatalog(connectionId: string): Promise<CatalogEntry[]> {
  const credentials = await getEnabledBusinessIntegration(connectionId);
  if (!credentials) return [];

  const isFresh =
    credentials.catalogFetchedAt && Date.now() - credentials.catalogFetchedAt.getTime() < CATALOG_TTL_MS;
  if (isFresh) {
    const cached = catalogResponseSchema.shape.functions.safeParse(credentials.catalogJson);
    if (cached.success) return cached.data;
  }

  const fresh = await fetchCatalog(credentials);
  if (fresh) {
    await cacheBusinessIntegrationCatalog(credentials.id, { functions: fresh });
    return fresh;
  }

  // Busca fresca falhou — cai pro cache antigo (vencido ou não) em vez de
  // devolver vazio, se houver algo salvo.
  const stale = catalogResponseSchema.shape.functions.safeParse(credentials.catalogJson);
  return stale.success ? stale.data : [];
}
