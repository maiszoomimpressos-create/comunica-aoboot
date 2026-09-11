import { prisma } from "@/lib/db/prisma";

export interface ContactListSummary {
  id: string;
  name: string;
  connectionId: string;
  createdAt: Date;
  memberCount: number;
}

export async function listListsForConnection(
  tenantId: string,
  connectionId: string
): Promise<ContactListSummary[]> {
  const lists = await prisma.contactList.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    connectionId: l.connectionId,
    createdAt: l.createdAt,
    memberCount: l._count.members,
  }));
}

export function getListSummary(tenantId: string, listId: string) {
  return prisma.contactList.findFirst({ where: { id: listId, tenantId } });
}

export function createList(tenantId: string, connectionId: string, name: string) {
  return prisma.contactList.create({ data: { tenantId, connectionId, name } });
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
}

export async function listMembersOfList(tenantId: string, listId: string): Promise<ListMemberRow[]> {
  const members = await prisma.contactListMember.findMany({
    where: { listId, list: { tenantId } },
    orderBy: { addedAt: "desc" },
    include: { contact: { select: { phone: true, name: true, optedOut: true } } },
  });
  return members.map((m) => ({
    contactId: m.contactId,
    phone: m.contact.phone,
    name: m.contact.name,
    optedOut: m.contact.optedOut,
    addedAt: m.addedAt,
  }));
}

/** Adds contacts to a list, skipping ones already members — never throws on
 * a duplicate. Caller (service layer) is responsible for filtering out
 * `optedOut` contacts before calling this. */
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
