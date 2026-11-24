import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import {
  getConnectionWithSecret,
  getConnectionSummary,
} from "@/repositories/channel-connection.repository";
import {
  listContactsForConnection,
  listContactsForList,
  listContactsNotInList,
  listContactsNotInListForTenant,
  upsertSyncedContacts,
  setContactOptOut,
  type ContactRow,
} from "@/repositories/contact.repository";
import { normalizeCsvPhone } from "@/lib/csv/parse-contacts-csv";
import {
  applyTenantOptOutsToContacts,
  listOptedOutPhoneKeys,
  optOutPhoneForTenant,
  removeTenantOptOut,
} from "@/repositories/tenant-opt-out.repository";
import { phoneKey } from "@/lib/whatsapp/phone-sanitize";
import {
  listListsForConnection,
  listListsForTenant,
  getListSummary,
  createAssembledList,
  getOrCreateExtractedListForConnection,
  renameList,
  deleteList,
  listMembersOfList,
  addContactsToList as addContactsToListRepo,
  removeContactFromList,
  type ContactListSummary,
  type ListMemberRow,
} from "@/repositories/contact-list.repository";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/server/errors";

/** Loads the connection + decrypted credentials, throwing the same
 * "not configured yet" / "not paired yet" errors every other
 * connection-scoped feature (send message, QR code, ...) already throws —
 * Campanhas re-checks CONNECTED here for the same reason
 * sendPurchaseConfirmation does: no point calling the provider otherwise. */
export async function requireConnectedConnection(tenantId: string, connectionId: string) {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }
  if (connection.status !== "CONNECTED") {
    throw new ConflictError("Esta conexão precisa estar conectada (QR code pareado) para sincronizar contatos.");
  }
  return connection;
}

export interface SyncContactsResult {
  total: number;
  created: number;
  updated: number;
  /** Entradas ignoradas (id @lid, grupo, valor que não é telefone). */
  skipped?: number;
}

/** Pulls every contact from the connected WhatsApp's own address book and
 * upserts them as `Contact` rows (`source: "sync"`) — see
 * importContactsFromCsv for the other supported source, CSV import. Never
 * touches `optedOut` on existing contacts (upsertSyncedContacts's own
 * contract) — a re-sync can never silently undo an opt-out.
 *
 * Also keeps this connection's lista extraída (uma só, criada
 * automaticamente aqui na primeira vez) em dia com todo contato ativo dela
 * — o usuário não cria essa lista à mão, ela só aparece em "Listas" depois
 * de sincronizar. */
export async function syncContactsFromConnection(
  tenantId: string,
  connectionId: string
): Promise<SyncContactsResult> {
  const connection = await requireConnectedConnection(tenantId, connectionId);

  const apiToken = decryptSecret(connection.apiTokenCipher!);
  const provider = getWhatsappProvider(connection.provider.key);
  const result = await provider.listContacts({
    apiUrl: connection.apiUrl!,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });

  if (!result.ok && result.contacts.length === 0) {
    throw new ConflictError(result.message || "Não foi possível buscar os contatos da instância.");
  }

  const { created, updated } = await upsertSyncedContacts(
    tenantId,
    connectionId,
    connection.phoneNumber,
    result.contacts.map((c) => ({ phone: c.phone, name: c.name, nameSource: c.nameSource }))
  );
  // Quem já pediu descadastro em qualquer número da empresa continua fora.
  await applyTenantOptOutsToContacts(tenantId);

  const extractedList = await getOrCreateExtractedListForConnection(
    tenantId,
    connectionId,
    connection.phoneNumber,
    `Contatos de ${connection.phoneNumber}`
  );
  // Só os contatos deste número (não "todo contato já sincronizado nessa
  // conexão", que pode incluir agendas de números anteriores pareados na
  // mesma conexão — ver getOrCreateExtractedListForConnection).
  const connectionContacts = await listContactsForConnection(tenantId, connectionId);
  const activeContactIds = connectionContacts
    .filter((c) => !c.optedOut && c.originPhoneNumber === connection.phoneNumber)
    .map((c) => c.id);
  if (activeContactIds.length > 0) {
    await addContactsToListRepo(tenantId, extractedList.id, activeContactIds);
  }

  return { total: result.contacts.length, created, updated, skipped: result.skipped ?? 0 };
}

export interface ContactsByListEntry {
  list: ContactListSummary;
  contacts: ContactRow[];
}

/** Contatos desta conexão agrupados por lista extraída (a da agenda inteira
 * + uma por grupo sincronizado) — feeds a aba Contatos, que mostra um bloco
 * retrátil por lista em vez de uma tabela única com tudo misturado. Um
 * contato que está em mais de uma lista (ex: participante de grupo que
 * também está na agenda) aparece em cada bloco correspondente. */
export async function getContactsGroupedByList(
  tenantId: string,
  connectionId: string
): Promise<ContactsByListEntry[]> {
  const lists = await listListsForConnection(tenantId, connectionId);
  // Agenda inteira (sourceGroupId null) primeiro, grupos depois.
  const sorted = [...lists].sort((a, b) => Number(!!a.sourceGroupId) - Number(!!b.sourceGroupId));

  return Promise.all(
    sorted.map(async (list) => ({
      list,
      contacts: await listContactsForList(tenantId, list.id),
    }))
  );
}

/** Opt-out manual pelo painel vale pra EMPRESA inteira (todas as
 * conexões, todos os contatos com esse telefone) — mesma regra do opt-out
 * por palavra-chave. Desfazer também é por empresa. */
export async function setContactOptOutStatus(
  tenantId: string,
  contactId: string,
  optedOut: boolean
): Promise<void> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { phone: true } });
  if (!contact) throw new NotFoundError("Contato não encontrado.");
  const result = await setContactOptOut(tenantId, contactId, optedOut, "manual");
  if (result.count === 0) throw new NotFoundError("Contato não encontrado.");
  if (optedOut) await optOutPhoneForTenant(tenantId, contact.phone, "manual");
  else await removeTenantOptOut(tenantId, contact.phone);
}

/** Resolve o connectionId dono deste contato (Contact.connectionId é
 * obrigatório, ver schema.prisma) pra checagem de connection scope na
 * camada de action antes de opt-out manual. */
export async function getContactConnectionId(tenantId: string, contactId: string): Promise<string> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
  if (!contact) throw new NotFoundError("Contato não encontrado.");
  return contact.connectionId;
}

/** Resolve o connectionId de uma lista pra checagem de connection scope —
 * null pra uma lista ASSEMBLED (nunca presa a um número só, visível ao
 * tenant inteiro, ver schema.prisma e listEligibleContacts). */
export async function getListConnectionId(tenantId: string, listId: string): Promise<string | null> {
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");
  return list.connectionId;
}

// --- Listas ------------------------------------------------------------------

export function getListsForConnection(tenantId: string, connectionId: string): Promise<ContactListSummary[]> {
  return listListsForConnection(tenantId, connectionId);
}

/** Todas as listas do tenant — extraídas de qualquer número + montadas.
 * Usado pela página central "Listas" e pelo seletor de lista da campanha
 * (que pode disparar pra qualquer lista, não só as do número atual). */
export function getListsForTenant(tenantId: string): Promise<ContactListSummary[]> {
  return listListsForTenant(tenantId);
}

export async function createAssembledContactList(tenantId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Informe um nome para a lista.");
  return createAssembledList(tenantId, trimmed);
}

/** Máximo de linhas por chamada de importação — o navegador lê e
 * parseia o CSV inteiro localmente e manda em pedaços, então o limite de
 * ~1 MB do corpo de uma Server Action nunca é atingido, seja qual for o
 * tamanho do arquivo. */
export const CSV_IMPORT_CHUNK_SIZE = 1000;

export interface ImportCsvChunkInput {
  /** null no primeiro pedaço — cria a lista montada e devolve o id. */
  listId: string | null;
  listName: string;
  rows: { phone: string; name: string | null }[];
}

export interface ImportCsvChunkResult {
  listId: string;
  imported: number;
  skippedInvalid: number;
  skippedOptOut: number;
}

/** Importa um pedaço de um CSV (já parseado no navegador) numa lista
 * montada. Os contatos ficam presos a `connectionId` (Contact.connectionId
 * é obrigatório) com `source: "import"`. Regras:
 * - telefone é re-normalizado aqui (nunca confia no cliente);
 * - contato que já existe NÃO tem o nome sobrescrito (só preenche vazio);
 * - quem está em opt-out (do contato ou da empresa) NÃO entra na lista. */
export async function importCsvChunk(
  tenantId: string,
  connectionId: string,
  input: ImportCsvChunkInput
): Promise<ImportCsvChunkResult> {
  if (input.rows.length > CSV_IMPORT_CHUNK_SIZE) {
    throw new ValidationError(`No máximo ${CSV_IMPORT_CHUNK_SIZE} linhas por envio.`);
  }
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  let listId = input.listId;
  if (listId) {
    const list = await getListSummary(tenantId, listId);
    if (!list || list.type !== "ASSEMBLED") throw new NotFoundError("Lista não encontrada.");
  } else {
    const trimmedName = input.listName.trim();
    if (!trimmedName) throw new ValidationError("Informe um nome para a lista.");
    listId = (await createAssembledList(tenantId, trimmedName)).id;
  }

  const seen = new Set<string>();
  const contacts: { phone: string; name?: string }[] = [];
  let skippedInvalid = 0;
  for (const row of input.rows) {
    const phone = normalizeCsvPhone(row.phone);
    if (!phone) {
      skippedInvalid++;
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    contacts.push({ phone, name: row.name?.trim() || undefined });
  }

  if (contacts.length > 0) {
    await upsertSyncedContacts(tenantId, connectionId, connection.phoneNumber, contacts, "import");
    await applyTenantOptOutsToContacts(tenantId);
  }

  const rows = await prisma.contact.findMany({
    where: { tenantId, connectionId, phone: { in: contacts.map((c) => c.phone) } },
    select: { id: true, phone: true, optedOut: true },
  });
  const optedOutKeys = await listOptedOutPhoneKeys(tenantId);
  const eligible = rows.filter((c) => !c.optedOut && !optedOutKeys.has(phoneKey(c.phone)));
  const imported = await addContactsToListRepo(tenantId, listId, eligible.map((c) => c.id));

  return { listId, imported, skippedInvalid, skippedOptOut: rows.length - eligible.length };
}

export interface CreateManualContactInput {
  phone: string;
  name: string | null;
  listId: string | null;
}

/** Cadastro manual de UM contato (source "manual"), opcionalmente já
 * adicionado a uma lista. O nome digitado vale (nameSource "manual") e a
 * sincronização com a Z-API não troca mais; respeita o opt-out da empresa. */
export async function createManualContact(tenantId: string, connectionId: string, input: CreateManualContactInput) {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const phone = normalizeCsvPhone(input.phone);
  if (!phone) throw new ValidationError("Telefone inválido — use DDD + número (ex.: 11 91234-5678).");

  await upsertSyncedContacts(
    tenantId,
    connectionId,
    connection.phoneNumber,
    [{ phone, name: input.name?.trim() || undefined }],
    "manual"
  );
  const contact = await prisma.contact.findUnique({ where: { connectionId_phone: { connectionId, phone } } });
  if (!contact) throw new ConflictError("Não foi possível salvar o contato.");
  await applyTenantOptOutsToContacts(tenantId, [contact.id]);
  const fresh = await prisma.contact.findUnique({ where: { id: contact.id }, select: { optedOut: true } });

  let addedToList = false;
  if (input.listId && !fresh?.optedOut) {
    const list = await getListSummary(tenantId, input.listId);
    if (!list) throw new NotFoundError("Lista não encontrada.");
    if (list.type === "EXTRACTED" && list.connectionId !== connectionId) {
      throw new ValidationError("Uma lista extraída só aceita contatos do próprio número.");
    }
    addedToList = (await addContactsToListRepo(tenantId, input.listId, [contact.id])) > 0;
  }

  return { contactId: contact.id, phone, optedOut: !!fresh?.optedOut, addedToList };
}

export async function renameContactList(tenantId: string, listId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Informe um nome para a lista.");
  const result = await renameList(tenantId, listId, trimmed);
  if (result.count === 0) throw new NotFoundError("Lista não encontrada.");
}

export async function deleteContactList(tenantId: string, listId: string) {
  // `Campaign.listId` has no ON DELETE CASCADE (a campaign must always be
  // able to point back at the list it targeted) — check first and return a
  // clear message instead of letting a raw FK-violation reach the caller.
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");
  const campaignCount = await prisma.campaign.count({ where: { tenantId, listId } });
  if (campaignCount > 0) {
    throw new ConflictError("Essa lista já foi usada por uma campanha e não pode ser excluída.");
  }

  const result = await deleteList(tenantId, listId);
  if (result.count === 0) throw new NotFoundError("Lista não encontrada.");
}

export interface ListDetail {
  list: { id: string; name: string; type: "EXTRACTED" | "ASSEMBLED"; connectionId: string | null };
  members: ListMemberRow[];
  availableContacts: ContactRow[];
}

/** Contatos elegíveis pra entrar numa lista: só os do próprio número, pra
 * uma extraída; qualquer número do tenant, pra uma montada. */
function listEligibleContacts(tenantId: string, connectionId: string | null, listId: string) {
  return connectionId
    ? listContactsNotInList(tenantId, connectionId, listId)
    : listContactsNotInListForTenant(tenantId, listId);
}

/** Everything the list-detail screen needs in one call: current members +
 * the contacts not yet on this list (the "add" picker) — scoped to one
 * número numa lista extraída, ao tenant inteiro numa lista montada. */
export async function getListDetail(tenantId: string, listId: string): Promise<ListDetail> {
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");

  const [members, availableContacts] = await Promise.all([
    listMembersOfList(tenantId, listId),
    listEligibleContacts(tenantId, list.connectionId, listId),
  ]);

  return {
    list: { id: list.id, name: list.name, type: list.type, connectionId: list.connectionId },
    members,
    availableContacts,
  };
}

/** Adds contacts to a list — silently drops any contactId that doesn't
 * belong to this tenant/connection or is opted out, rather than throwing,
 * since the picker UI already only offers valid options; a stale
 * selection (opted out mid-click) just adds fewer than requested. Opted-out
 * contacts are never added to a list (seção "opt-out" do plano). */
export async function addContactsToList(
  tenantId: string,
  listId: string,
  contactIds: string[]
): Promise<number> {
  if (contactIds.length === 0) return 0;
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");

  const eligible = await listEligibleContacts(tenantId, list.connectionId, listId);
  const eligibleIds = new Set(eligible.map((c) => c.id));
  const toAdd = contactIds.filter((id) => eligibleIds.has(id));

  return addContactsToListRepo(tenantId, listId, toAdd);
}

export async function removeContactFromListById(tenantId: string, listId: string, contactId: string) {
  const result = await removeContactFromList(tenantId, listId, contactId);
  if (result.count === 0) throw new NotFoundError("Contato não está nessa lista.");
}

/** Thin re-export so UI code that just needs "does this connection exist
 * and belong to this tenant" doesn't have to import channel-connection
 * repository directly. */
export function getConnectionForCampaigns(tenantId: string, connectionId: string) {
  return getConnectionSummary(tenantId, connectionId);
}

export interface ListNamePreview {
  /** Contatos ativos (sem opt-out) da lista. */
  total: number;
  /** Quantos têm nome, por origem ("sem_nome" = sem nome nenhum). */
  bySource: Record<string, number>;
  /** Até 3 contatos com nome (pra prévia da mensagem). */
  samples: { name: string; phone: string; nameSource: string | null }[];
  /** Contatos frios (captados do Google) ativos na lista — >0 = a campanha
   * segue as regras de contato frio. */
  coldCount: number;
}

/** Prévia de "de onde vem o {{nome}}" pra tela de criar campanha. */
export async function getListNamePreview(tenantId: string, listId: string): Promise<ListNamePreview> {
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");
  const where = { tenantId, optedOut: false, listMemberships: { some: { listId } } };
  const [groups, samples] = await Promise.all([
    prisma.contact.groupBy({ by: ["nameSource"], where: { ...where, name: { not: null } }, _count: { _all: true } }),
    prisma.contact.findMany({
      where: { ...where, name: { not: null } },
      select: { name: true, phone: true, nameSource: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    }),
  ]);
  const [total, coldCount] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...where, isCold: true } }),
  ]);
  const bySource: Record<string, number> = {};
  let named = 0;
  for (const g of groups) {
    const key = g.nameSource ?? "whatsapp";
    bySource[key] = (bySource[key] ?? 0) + g._count._all;
    named += g._count._all;
  }
  bySource.sem_nome = Math.max(0, total - named);
  return {
    total,
    coldCount,
    bySource,
    samples: samples.filter((c): c is { name: string; phone: string; nameSource: string | null } => !!c.name),
  };
}
