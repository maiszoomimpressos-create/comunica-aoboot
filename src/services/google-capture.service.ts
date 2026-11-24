/**
 * "Captar contatos do Google": busca empresas/autônomos com telefone
 * público na Google Places API (New) por categoria + cidade, mostra a
 * prévia e salva os marcados como contatos FRIOS numa lista montada.
 *
 * O que é gravado por contato (e por quê):
 * - telefone (55 + DDD + número) e nome da empresa — sem eles não há
 *   contato pra campanha;
 * - externalId = place id do Google (os termos da Google permitem guardar
 *   sem prazo), captureQuery (texto da busca), capturedAt, phoneType,
 *   source "google_places" e isCold = true.
 * NÃO são gravados: endereço, site, categorias, link do Maps (só aparecem
 * na prévia). Ver a nota de termos em lib/google-places/places.ts.
 *
 * Opt-out: quem está em tenant_opt_out (ou tem contato com opt-out) nunca
 * entra — nem na prévia, nem no salvar (revalidado no servidor).
 */
import { prisma } from "@/lib/db/prisma";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { listOptedOutPhoneKeys } from "@/repositories/tenant-opt-out.repository";
import { addContactsToList, createAssembledList } from "@/repositories/contact-list.repository";
import { phoneKey } from "@/lib/whatsapp/phone-sanitize";
import {
  buildSearchQuery,
  clampLimit,
  estimateSearchCalls,
  MAX_RESULTS_PER_SEARCH,
  type PlacesSearchInput,
} from "@/lib/google-places/places";
import { buildCapturePreview, planCaptureSave, type CapturePreview, type CaptureSaveItem } from "@/lib/google-places/capture";
import { searchPlacesByText } from "@/services/google-places.service";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

export const GOOGLE_PLACES_SOURCE = "google_places";

/** Telefones já bloqueados na empresa: tenant_opt_out + contatos com
 * opt-out (chaves normalizadas). */
async function blockedPhoneKeys(tenantId: string): Promise<Set<string>> {
  const [tenantKeys, optedContacts] = await Promise.all([
    listOptedOutPhoneKeys(tenantId),
    prisma.contact.findMany({ where: { tenantId, optedOut: true }, select: { phone: true } }),
  ]);
  const keys = new Set(tenantKeys);
  for (const c of optedContacts) keys.add(phoneKey(c.phone));
  return keys;
}

function validateSearch(input: PlacesSearchInput) {
  if (!input.category.trim()) throw new ValidationError("Informe a categoria (ex.: restaurantes).");
  if (!input.city.trim()) throw new ValidationError("Informe a cidade.");
  if (!/^[A-Za-z]{2}$/.test(input.uf.trim())) throw new ValidationError("Informe a UF (ex.: PR).");
  if (input.category.length > 80 || input.city.length > 80) throw new ValidationError("Texto da busca longo demais.");
}

export interface GoogleCaptureSearchResult extends CapturePreview {
  query: string;
  calls: number;
  maxCalls: number;
}

export async function searchGoogleCapture(
  tenantId: string,
  connectionId: string,
  input: PlacesSearchInput,
  options: { fetchImpl?: typeof fetch; apiKey?: string | null } = {}
): Promise<GoogleCaptureSearchResult> {
  validateSearch(input);
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const query = buildSearchQuery(input);
  const limit = clampLimit(input.limit);
  const { places, calls } = await searchPlacesByText(query, limit, options);

  const [contacts, blocked] = await Promise.all([
    prisma.contact.findMany({ where: { tenantId }, select: { phone: true } }),
    blockedPhoneKeys(tenantId),
  ]);
  const existing = new Set(contacts.map((c) => phoneKey(c.phone)));
  const preview = buildCapturePreview(places, existing, blocked);
  return { ...preview, query, calls, maxCalls: estimateSearchCalls(limit) };
}

export interface SaveGoogleCaptureInput {
  listName: string;
  query: string;
  items: CaptureSaveItem[];
}

export async function saveGoogleCapture(tenantId: string, connectionId: string, input: SaveGoogleCaptureInput) {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  const listName = input.listName.trim();
  if (!listName) throw new ValidationError("Informe um nome para a lista.");
  if (input.items.length === 0) throw new ValidationError("Marque pelo menos um contato.");
  if (input.items.length > MAX_RESULTS_PER_SEARCH) {
    throw new ValidationError(`No máximo ${MAX_RESULTS_PER_SEARCH} contatos por captação.`);
  }
  const query = input.query.trim().slice(0, 200);

  const [onConnection, blocked] = await Promise.all([
    prisma.contact.findMany({ where: { tenantId, connectionId }, select: { phone: true } }),
    blockedPhoneKeys(tenantId),
  ]);
  const existingByKey = new Map(onConnection.map((c) => [phoneKey(c.phone), c.phone]));
  const plan = planCaptureSave(input.items, existingByKey, blocked);

  const now = new Date();
  if (plan.toCreate.length > 0) {
    await prisma.contact.createMany({
      data: plan.toCreate.map((item) => ({
        tenantId,
        connectionId,
        phone: item.phone,
        name: item.name,
        nameSource: "google",
        source: GOOGLE_PLACES_SOURCE,
        isCold: true,
        externalId: item.placeId,
        captureQuery: query,
        capturedAt: now,
        phoneType: item.phoneKind,
        originPhoneNumber: connection.phoneNumber,
      })),
      skipDuplicates: true,
    });
  }

  const phones = [...plan.toCreate.map((c) => c.phone), ...plan.existingPhones];
  const rows = await prisma.contact.findMany({
    where: { tenantId, connectionId, phone: { in: phones }, optedOut: false },
    select: { id: true, phone: true },
  });
  // Mais uma conferência de opt-out logo antes de entrar na lista.
  const eligible = rows.filter((r) => !blocked.has(phoneKey(r.phone)));

  const list = await createAssembledList(tenantId, listName);
  const added = eligible.length > 0 ? await addContactsToList(tenantId, list.id, eligible.map((r) => r.id)) : 0;

  return {
    listId: list.id,
    added,
    created: plan.toCreate.length,
    reusedExisting: plan.existingPhones.length,
    skippedOptOut: plan.skippedOptOut,
    skippedInvalid: plan.skippedInvalid,
  };
}
