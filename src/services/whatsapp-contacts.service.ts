import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import {
  getConnectionWithSecret,
  getConnectionSummary,
} from "@/repositories/channel-connection.repository";
import {
  listContactsForConnection,
  countContactsForConnection,
  listContactsNotInList,
  upsertSyncedContacts,
  setContactOptOut,
  type ContactRow,
} from "@/repositories/contact.repository";
import {
  listListsForConnection,
  getListSummary,
  createList,
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
async function requireConnectedConnection(tenantId: string, connectionId: string) {
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
}

/** Pulls every contact from the connected WhatsApp's own address book and
 * upserts them as `Contact` rows — the only supported source for now (see
 * campaigns module plan; manual add / CSV import are future work). Never
 * touches `optedOut` on existing contacts (upsertSyncedContacts's own
 * contract) — a re-sync can never silently undo an opt-out. */
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
    result.contacts.map((c) => ({ phone: c.phone, name: c.name }))
  );

  return { total: result.contacts.length, created, updated };
}

export async function getContactsOverview(
  tenantId: string,
  connectionId: string
): Promise<{ contacts: ContactRow[]; activeCount: number }> {
  const [contacts, activeCount] = await Promise.all([
    listContactsForConnection(tenantId, connectionId),
    countContactsForConnection(tenantId, connectionId),
  ]);
  return { contacts, activeCount };
}

export async function setContactOptOutStatus(
  tenantId: string,
  contactId: string,
  optedOut: boolean
): Promise<void> {
  const result = await setContactOptOut(tenantId, contactId, optedOut, "manual");
  if (result.count === 0) throw new NotFoundError("Contato não encontrado.");
}

// --- Listas ------------------------------------------------------------------

export function getListsForConnection(tenantId: string, connectionId: string): Promise<ContactListSummary[]> {
  return listListsForConnection(tenantId, connectionId);
}

export async function createContactList(tenantId: string, connectionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Informe um nome para a lista.");
  return createList(tenantId, connectionId, trimmed);
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
  list: { id: string; name: string; connectionId: string };
  members: ListMemberRow[];
  availableContacts: ContactRow[];
}

/** Everything the list-detail screen needs in one call: current members +
 * the connection's contacts not yet on this list (the "add" picker). */
export async function getListDetail(tenantId: string, listId: string): Promise<ListDetail> {
  const list = await getListSummary(tenantId, listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");

  const [members, availableContacts] = await Promise.all([
    listMembersOfList(tenantId, listId),
    listContactsNotInList(tenantId, list.connectionId, listId),
  ]);

  return {
    list: { id: list.id, name: list.name, connectionId: list.connectionId },
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

  const eligible = await listContactsNotInList(tenantId, list.connectionId, listId);
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
