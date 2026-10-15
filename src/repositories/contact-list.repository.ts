import { prisma } from "@/lib/db/prisma";
import type { ContactListType } from "@/generated/prisma/client";

export interface ContactListSummary {
  id: string;
  name: string;
  type: ContactListType;
  // null numa lista ASSEMBLED — não tem um único número de origem.
  connectionId: string | null;
  originConnectionName: string | null;
  originPhoneNumber: string | null;
  // JID do grupo, quando esta lista veio de "sincronizar de um grupo" em
  // vez da agenda inteira do número — null nos outros casos.
  sourceGroupId: string | null;
  createdAt: Date;
  memberCount: number;
}

type ListWithCounts = {
  id: string;
  name: string;
  type: ContactListType;
  connectionId: string | null;
  sourceGroupId: string | null;
  originPhoneNumber: string | null;
  createdAt: Date;
  connection: { connectionName: string } | null;
  _count: { members: number };
};

function toSummary(list: ListWithCounts): ContactListSummary {
  return {
    id: list.id,
    name: list.name,
    type: list.type,
    connectionId: list.connectionId,
    originConnectionName: list.connection?.connectionName ?? null,
    originPhoneNumber: list.originPhoneNumber,
    sourceGroupId: list.sourceGroupId,
    createdAt: list.createdAt,
    memberCount: list._count.members,
  };
}

const listSelect = {
  id: true,
  name: true,
  type: true,
  connectionId: true,
  sourceGroupId: true,
  originPhoneNumber: true,
  createdAt: true,
  connection: { select: { connectionName: true } },
  _count: { select: { members: true } },
} as const;

/** Listas extraídas de UM número — usado na seção "Listas" da página de
 * Campanhas por conexão (contexto de extração). */
export async function listListsForConnection(
  tenantId: string,
  connectionId: string
): Promise<ContactListSummary[]> {
  const lists = await prisma.contactList.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    select: listSelect,
  });
  return lists.map(toSummary);
}

/** Todas as listas do tenant (extraídas de qualquer número + montadas) —
 * feita para a página central "Listas" e para o seletor de lista na criação
 * de campanha, que agora pode disparar para qualquer lista independente de
 * qual número a originou. */
export async function listListsForTenant(tenantId: string): Promise<ContactListSummary[]> {
  const lists = await prisma.contactList.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: listSelect,
  });
  return lists.map(toSummary);
}

export function getListSummary(tenantId: string, listId: string) {
  return prisma.contactList.findFirst({ where: { id: listId, tenantId } });
}

/** Cria uma lista extraída — sempre presa a um número, connectionId fixo
 * pra sempre (só o nome pode mudar depois, via renameList). */
export function createExtractedList(
  tenantId: string,
  connectionId: string,
  originPhoneNumber: string,
  name: string
) {
  return prisma.contactList.create({
    data: { tenantId, connectionId, originPhoneNumber, name, type: "EXTRACTED" },
  });
}

/** Uma lista extraída "da agenda inteira" (sourceGroupId null) por NÚMERO
 * sincronizado nessa conexão — não só por conexão: o mesmo connectionId
 * pode trocar de número pareado ao longo do tempo (extrair de vários
 * aparelhos reaproveitando a mesma instância), e cada número ganha sua
 * própria lista em vez de reaproveitar/misturar a de um número anterior.
 * Idempotente pro mesmo número: chama de novo a cada sync dele, sem
 * duplicar. */
export async function getOrCreateExtractedListForConnection(
  tenantId: string,
  connectionId: string,
  originPhoneNumber: string,
  defaultName: string
) {
  const existing = await prisma.contactList.findFirst({
    where: { tenantId, connectionId, type: "EXTRACTED", sourceGroupId: null, originPhoneNumber },
  });
  if (existing) return existing;
  return createExtractedList(tenantId, connectionId, originPhoneNumber, defaultName);
}

/** Uma lista extraída por grupo por conexão (ver @@unique no schema) —
 * criada/atualizada toda vez que o tenant sincroniza esse grupo
 * específico, do mesmo jeito idempotente que a lista da agenda inteira.
 * sourceGroupId já identifica univocamente o grupo (pertence a um único
 * WhatsApp), então não precisa entrar no filtro de busca como no caso da
 * agenda inteira — mas o número é carimbado do mesmo jeito ao criar. */
export async function getOrCreateExtractedListForGroup(
  tenantId: string,
  connectionId: string,
  sourceGroupId: string,
  originPhoneNumber: string,
  defaultName: string
) {
  const existing = await prisma.contactList.findFirst({
    where: { tenantId, connectionId, type: "EXTRACTED", sourceGroupId },
  });
  if (existing) return existing;
  return prisma.contactList.create({
    data: { tenantId, connectionId, sourceGroupId, originPhoneNumber, name: defaultName, type: "EXTRACTED" },
  });
}

/** Cria uma lista montada — sem número de origem, agregável a partir de
 * contatos de qualquer conexão do tenant. */
export function createAssembledList(tenantId: string, name: string) {
  return prisma.contactList.create({ data: { tenantId, name, type: "ASSEMBLED" } });
}

export function renameList(tenantId: string, listId: string, name: string) {
  return prisma.contactList.updateMany({ where: { id: listId, tenantId }, data: { name } });
}

export function deleteList(tenantId: string, listId: string) {
  return prisma.contactList.deleteMany({ where: { id: listId, tenantId } });
}

export interface ListMemberRow {
  contactId: string;
  phone: string;
  name: string | null;
  optedOut: boolean;
  addedAt: Date;
  // Número que sincronizou esse contato — sempre visível, mesmo numa lista
  // extraída (onde é sempre o mesmo número em toda a lista), porque numa
  // lista montada os membros podem vir de números diferentes.
  originPhoneNumber: string;
}

export async function listMembersOfList(tenantId: string, listId: string): Promise<ListMemberRow[]> {
  const members = await prisma.contactListMember.findMany({
    where: { listId, list: { tenantId } },
    orderBy: { addedAt: "desc" },
    include: {
      contact: {
        select: { phone: true, name: true, optedOut: true, originPhoneNumber: true },
      },
    },
  });
  return members.map((m) => ({
    contactId: m.contactId,
    phone: m.contact.phone,
    name: m.contact.name,
    optedOut: m.contact.optedOut,
    addedAt: m.addedAt,
    originPhoneNumber: m.contact.originPhoneNumber,
  }));
}

/** Adds contacts to a list, skipping ones already members — never throws on
 * a duplicate. Caller (service layer) is responsible for filtering out
 * `optedOut` contacts, and for restricting which contacts are eligible for
 * this list (mesmo número, pra lista extraída; qualquer número do tenant,
 * pra lista montada) before calling this. */
export async function addContactsToList(
  tenantId: string,
  listId: string,
  contactIds: string[]
): Promise<number> {
  const list = await prisma.contactList.findFirst({ where: { id: listId, tenantId }, select: { id: true } });
  if (!list) return 0;

  const result = await prisma.contactListMember.createMany({
    data: contactIds.map((contactId) => ({ listId, contactId })),
    skipDuplicates: true,
  });
  return result.count;
}

export function removeContactFromList(tenantId: string, listId: string, contactId: string) {
  return prisma.contactListMember.deleteMany({
    where: { listId, contactId, list: { tenantId } },
  });
}
