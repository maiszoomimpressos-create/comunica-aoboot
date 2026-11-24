import { shouldReplaceContactName, type ContactNameSource } from "@/lib/whatsapp/contact-name";
import { prisma } from "@/lib/db/prisma";

export interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  /** Ver lib/whatsapp/contact-name.ts. */
  nameSource: string | null;
  source: string;
  optedOut: boolean;
  optedOutAt: Date | null;
  optedOutSource: string | null;
  consentStatus: string;
  createdAt: Date;
  connectionId: string;
  // Número que sincronizou esse contato — sem uso na tabela de contatos de
  // uma conexão só (é sempre o mesmo número), mas relevante no picker de
  // "adicionar contatos" de uma lista montada, que mistura números.
  originPhoneNumber: string;
}

const contactSelect = {
  id: true,
  phone: true,
  name: true,
  nameSource: true,
  source: true,
  optedOut: true,
  optedOutAt: true,
  optedOutSource: true,
  consentStatus: true,
  createdAt: true,
  connectionId: true,
  originPhoneNumber: true,
} as const;

export async function listContactsForConnection(tenantId: string, connectionId: string): Promise<ContactRow[]> {
  return prisma.contact.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    select: contactSelect,
  });
}

export function countContactsForConnection(tenantId: string, connectionId: string) {
  return prisma.contact.count({ where: { tenantId, connectionId, optedOut: false } });
}

/** Members of one specific list, as full `ContactRow`s (not the lighter
 * `ListMemberRow` shape) — feeds the per-list collapsible sections on the
 * Contatos tab, which reuses the same `ContactsTable` (opt-out toggle and
 * all) already used for the flat view. */
export async function listContactsForList(tenantId: string, listId: string): Promise<ContactRow[]> {
  return prisma.contact.findMany({
    where: { tenantId, listMemberships: { some: { listId } } },
    orderBy: { createdAt: "desc" },
    select: contactSelect,
  });
}

/** Contacts of the connection not yet in a given list — feeds the "add to
 * list" picker of a lista extraída, que só pode ganhar contatos do próprio
 * número. */
export async function listContactsNotInList(
  tenantId: string,
  connectionId: string,
  listId: string
): Promise<ContactRow[]> {
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

/** Mesma coisa, mas sem restringir a conexão — feeds the "add to list"
 * picker of a lista montada, que pode juntar contatos de qualquer número do
 * tenant. */
export async function listContactsNotInListForTenant(tenantId: string, listId: string): Promise<ContactRow[]> {
  return prisma.contact.findMany({
    where: {
      tenantId,
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
  /** Origem do nome (ver lib/whatsapp/contact-name.ts). Sem valor: deduz
   * de `source` (import → csv, manual → manual, resto → whatsapp). */
  nameSource?: ContactNameSource;
}

function defaultNameSource(source: string): ContactNameSource {
  if (source === "import") return "csv";
  if (source === "manual") return "manual";
  return "whatsapp";
}

/**
 * Cria/atualiza contatos de uma conexão em lote (sync da agenda, grupo,
 * CSV, cadastro manual). Nome: segue shouldReplaceContactName — nome de
 * CSV/manual nunca é trocado pela Z-API, CSV só preenche quem está sem
 * nome, agenda > perfil. Nunca mexe em opt-out.
 */
export async function upsertSyncedContacts(
  tenantId: string,
  connectionId: string,
  originPhoneNumber: string,
  contacts: SyncedContact[],
  source: string = "sync"
): Promise<{ created: number; updated: number }> {
  const existing = await prisma.contact.findMany({
    where: { tenantId, connectionId },
    select: { id: true, phone: true, name: true, nameSource: true, originPhoneNumber: true },
  });
  const existingByPhone = new Map(existing.map((c) => [c.phone, c]));

  const toCreate: SyncedContact[] = [];
  const seen = new Set<string>();
  const toUpdate: {
    id: string;
    data: { name?: string; nameSource?: string; originPhoneNumber?: string };
  }[] = [];

  for (const contact of contacts) {
    if (seen.has(contact.phone)) continue;
    seen.add(contact.phone);
    const incomingName = contact.name?.trim() || null;
    const incoming = incomingName
      ? { name: incomingName, source: contact.nameSource ?? defaultNameSource(source) }
      : null;
    const found = existingByPhone.get(contact.phone);
    if (!found) {
      toCreate.push({ phone: contact.phone, ...(incoming ? { name: incoming.name, nameSource: incoming.source } : {}) });
      continue;
    }
    const nameChanged = !!incoming && shouldReplaceContactName(found, incoming);
    // Só o sync da agenda re-carimba a origem — CSV/manual não "mudam" de
    // qual número o contato foi extraído.
    const originChanged = source === "sync" && found.originPhoneNumber !== originPhoneNumber;
    if (nameChanged || originChanged) {
      toUpdate.push({
        id: found.id,
        data: {
          ...(nameChanged && incoming ? { name: incoming.name, nameSource: incoming.source } : {}),
          ...(originChanged ? { originPhoneNumber } : {}),
        },
      });
    }
  }

  let created = 0;
  const chunkSize = 1000;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const result = await prisma.contact.createMany({
      data: toCreate.slice(i, i + chunkSize).map((c) => ({
        tenantId,
        connectionId,
        phone: c.phone,
        name: c.name,
        nameSource: c.name ? (c.nameSource ?? defaultNameSource(source)) : null,
        source,
        originPhoneNumber,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }

  const concurrency = 20;
  for (let i = 0; i < toUpdate.length; i += concurrency) {
    await Promise.all(
      toUpdate.slice(i, i + concurrency).map((u) => prisma.contact.update({ where: { id: u.id }, data: u.data }))
    );
  }

  return { created, updated: toUpdate.length };
}

/** Preenche/melhora o nome de UM contato com um nome vindo da Z-API (no
 * envio da campanha ou ao receber mensagem) — mesmas regras do sync: nunca
 * troca nome de CSV/manual. `where` por id ou por conexão + telefones
 * (variações com/sem 9º dígito). Devolve quantos contatos mudaram. */
export async function applyZapiNameToContacts(
  where: { contactId: string } | { connectionId: string; phones: string[] },
  incoming: { name: string; source: ContactNameSource }
): Promise<number> {
  const rows = await prisma.contact.findMany({
    where: "contactId" in where ? { id: where.contactId } : { connectionId: where.connectionId, phone: { in: where.phones } },
    select: { id: true, name: true, nameSource: true },
  });
  const targets = rows.filter((row) => shouldReplaceContactName(row, incoming));
  if (targets.length === 0) return 0;
  const result = await prisma.contact.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { name: incoming.name, nameSource: incoming.source },
  });
  return result.count;
}

/** Resolve os ids de contatos desta conexão a partir de uma lista de
 * telefones já normalizados — usado logo após um upsert (sync ou import)
 * pra pegar os ids recém-criados/atualizados e montá-los numa lista, sem
 * precisar que upsertSyncedContacts devolva os ids ela mesma. */
export async function findContactIdsByPhones(
  tenantId: string,
  connectionId: string,
  phones: string[]
): Promise<string[]> {
  if (phones.length === 0) return [];
  const rows = await prisma.contact.findMany({
    where: { tenantId, connectionId, phone: { in: phones } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
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
