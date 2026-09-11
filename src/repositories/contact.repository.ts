import { prisma } from "@/lib/db/prisma";

export interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  source: string;
  optedOut: boolean;
  optedOutAt: Date | null;
  optedOutSource: string | null;
  consentStatus: string;
  createdAt: Date;
}

const contactSelect = {
  id: true,
  phone: true,
  name: true,
  source: true,
  optedOut: true,
  optedOutAt: true,
  optedOutSource: true,
  consentStatus: true,
  createdAt: true,
} as const;

export function listContactsForConnection(tenantId: string, connectionId: string): Promise<ContactRow[]> {
  return prisma.contact.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    select: contactSelect,
  });
}

export function countContactsForConnection(tenantId: string, connectionId: string) {
  return prisma.contact.count({ where: { tenantId, connectionId, optedOut: false } });
}

/** Contacts of the connection not yet in a given list — feeds the "add to
 * list" picker so it never offers a contact already there. */
export function listContactsNotInList(tenantId: string, connectionId: string, listId: string): Promise<ContactRow[]> {
  return prisma.contact.findMany({
    where: {
      tenantId,
      connectionId,
      optedOut: false,
      listMemberships: { none: { listId } },
    },
    orderBy: { createdAt: "desc" },
    select: contactSelect,
  });
}

export interface SyncedContact {
  phone: string;
  name?: string;
}

/**
 * Upserts the connection's synced address book: existing phones get their
 * name refreshed (never touches `optedOut` — a re-sync must never silently
 * undo an opt-out), new phones are inserted with `source: "sync"`. Chunked
 * (concurrency of 20) instead of one giant sequential loop or a single
 * `createMany`, since we need per-row upsert semantics (insert-or-update)
 * that `createMany` doesn't support — fine for the address-book sizes this
 * targets; a very large book (tens of thousands) would need a bulk
 * SQL upsert instead, not attempted here.
 */
export async function upsertSyncedContacts(
  tenantId: string,
  connectionId: string,
  contacts: SyncedContact[]
): Promise<{ created: number; updated: number }> {
  const existing = await prisma.contact.findMany({
    where: { tenantId, connectionId },
    select: { id: true, phone: true, name: true },
  });
  const existingByPhone = new Map(existing.map((c) => [c.phone, c]));

  let created = 0;
  let updated = 0;
  const concurrency = 20;

  for (let i = 0; i < contacts.length; i += concurrency) {
    const batch = contacts.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (contact) => {
        const found = existingByPhone.get(contact.phone);
        if (!found) {
          await prisma.contact.create({
            data: { tenantId, connectionId, phone: contact.phone, name: contact.name, source: "sync" },
          });
          created++;
          return;
        }
        if (contact.name && contact.name !== found.name) {
          await prisma.contact.update({ where: { id: found.id }, data: { name: contact.name } });
          updated++;
        }
      })
    );
  }

  return { created, updated };
}

/** Manual bloqueio pelo painel — nunca reverte automaticamente num sync. */
export function setContactOptOut(
  tenantId: string,
  contactId: string,
  optedOut: boolean,
  source: "manual" | "keyword"
) {
  return prisma.contact.updateMany({
    where: { id: contactId, tenantId },
    data: optedOut
      ? { optedOut: true, optedOutAt: new Date(), optedOutSource: source }
      : { optedOut: false, optedOutAt: null, optedOutSource: null },
  });
}

// --- Webhook (inbound, sem sessão de tenant) --------------------------------

/** Resolves a contact purely by (connectionId, phone) — used from the
 * webhook opt-out path, which has no tenantId to scope by (same pattern as
 * getConnectionForWebhook in channel-connection.repository.ts). */
export function findContactByPhoneForWebhook(connectionId: string, phone: string) {
  return prisma.contact.findUnique({
    where: { connectionId_phone: { connectionId, phone } },
    select: { id: true, optedOut: true },
  });
}

export function optOutContactByIdForWebhook(contactId: string) {
  return prisma.contact.update({
    where: { id: contactId },
    data: { optedOut: true, optedOutAt: new Date(), optedOutSource: "keyword" },
  });
}
