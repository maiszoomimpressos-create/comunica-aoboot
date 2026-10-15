import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { ProviderGroup } from "@/lib/whatsapp/types";
import { listContactsForConnection, upsertSyncedContacts } from "@/repositories/contact.repository";
import {
  addContactsToList as addContactsToListRepo,
  getOrCreateExtractedListForGroup,
  getOrCreateExtractedListForConnection,
} from "@/repositories/contact-list.repository";
import { ConflictError } from "@/lib/server/errors";
import { requireConnectedConnection } from "./whatsapp-contacts.service";

/** Every WhatsApp group the connection participates in — fetched live from
 * the provider on each call (not persisted; groups a tenant belongs to can
 * change at any time on the phone itself), feeds the "sincronizar de um
 * grupo" picker. */
export async function listWhatsappGroups(tenantId: string, connectionId: string): Promise<ProviderGroup[]> {
  const connection = await requireConnectedConnection(tenantId, connectionId);
  const apiToken = decryptSecret(connection.apiTokenCipher!);
  const provider = getWhatsappProvider(connection.provider.key);

  const result = await provider.listGroups({
    apiUrl: connection.apiUrl!,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });
  if (!result.ok && result.groups.length === 0) {
    throw new ConflictError(result.message || "Não foi possível buscar os grupos da instância.");
  }
  return result.groups;
}

export interface SyncGroupContactsResult {
  total: number;
  created: number;
  updated: number;
  listId: string;
  listName: string;
}

/** Pulls a specific group's participant list and upserts them as `Contact`
 * rows — same upsert (never touches `optedOut`) as the whole-address-book
 * sync. The resulting participants land in TWO lists: the group's own
 * dedicated extracted list (so a campaign can still target just that
 * group) AND the connection's whole-address-book extracted list (so they
 * also count as "regular" contacts of that number, findable/usable
 * alongside everyone else) — never just one or the other. `groupName`
 * comes from the caller (already has it from listWhatsappGroups) rather
 * than re-fetched, since the metadata endpoint's group-name field isn't
 * guaranteed to match the list's. */
export async function syncContactsFromGroup(
  tenantId: string,
  connectionId: string,
  groupId: string,
  groupName: string
): Promise<SyncGroupContactsResult> {
  const connection = await requireConnectedConnection(tenantId, connectionId);

  const apiToken = decryptSecret(connection.apiTokenCipher!);
  const provider = getWhatsappProvider(connection.provider.key);
  const result = await provider.getGroupParticipants(
    { apiUrl: connection.apiUrl!, apiToken, phoneNumber: connection.phoneNumber },
    groupId
  );

  if (!result.ok) {
    throw new ConflictError(result.message || "Não foi possível buscar os participantes do grupo.");
  }

  const { created, updated } = await upsertSyncedContacts(
    tenantId,
    connectionId,
    connection.phoneNumber,
    result.participants.map((p) => ({ phone: p.phone, name: p.name }))
  );

  const [groupList, connectionList] = await Promise.all([
    getOrCreateExtractedListForGroup(
      tenantId,
      connectionId,
      groupId,
      connection.phoneNumber,
      `Grupo: ${groupName}`
    ),
    getOrCreateExtractedListForConnection(
      tenantId,
      connectionId,
      connection.phoneNumber,
      `Contatos de ${connection.phoneNumber}`
    ),
  ]);

  // Só os participantes deste grupo entram (não a agenda toda) — por isso
  // filtra pelos telefones vindos do provider, em vez de reusar "todo
  // contato ativo da conexão" como o sync da agenda inteira faz.
  const participantPhones = new Set(result.participants.map((p) => p.phone));
  const connectionContacts = await listContactsForConnection(tenantId, connectionId);
  const activeParticipantIds = connectionContacts
    .filter((c) => !c.optedOut && participantPhones.has(c.phone))
    .map((c) => c.id);

  if (activeParticipantIds.length > 0) {
    await Promise.all([
      addContactsToListRepo(tenantId, groupList.id, activeParticipantIds),
      addContactsToListRepo(tenantId, connectionList.id, activeParticipantIds),
    ]);
  }

  return {
    total: result.participants.length,
    created,
    updated,
    listId: groupList.id,
    listName: groupList.name,
  };
}
