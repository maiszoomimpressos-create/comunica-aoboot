// Backfills the "lista extraída" (ContactList type EXTRACTED) for every
// WhatsApp connection that already had contacts synced *before* that
// concept existed — syncContactsFromConnection() now creates/maintains this
// list itself on every future sync, but contacts synced earlier than that
// change have no list to show up in yet. Safe to re-run any time: only
// creates the list if missing (get-or-create) and only adds contacts not
// already members (skipDuplicates in the repository).
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { listContactsForConnection } from "@/repositories/contact.repository";
import {
  getOrCreateExtractedListForConnection,
  addContactsToList,
} from "@/repositories/contact-list.repository";

async function main() {
  const connections = await prisma.channelConnection.findMany({
    where: { channel: { type: "WHATSAPP" } },
    select: { id: true, tenantId: true, phoneNumber: true, connectionName: true },
  });

  let totalLists = 0;
  let totalMembers = 0;

  for (const connection of connections) {
    const contacts = await listContactsForConnection(connection.tenantId, connection.id);
    if (contacts.length === 0) continue;

    const list = await getOrCreateExtractedListForConnection(
      connection.tenantId,
      connection.id,
      connection.phoneNumber,
      `Contatos de ${connection.phoneNumber}`
    );
    const activeIds = contacts.filter((c) => !c.optedOut).map((c) => c.id);
    const added = activeIds.length > 0 ? await addContactsToList(connection.tenantId, list.id, activeIds) : 0;

    totalLists++;
    totalMembers += added;
    console.log(
      `${connection.connectionName} (${connection.phoneNumber}): lista "${list.name}" — ${added} contato(s) adicionado(s) (${contacts.length} sincronizado(s) no total).`
    );
  }

  console.log(`Done. ${totalLists} conexão(ões) processada(s), ${totalMembers} vínculo(s) de contato criado(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
