import { prisma } from "@/lib/db/prisma";

export interface ContactPresenceRow {
  phone: string;
  status: string;
  lastSeen: Date | null;
  updatedAt: Date;
}

/** Upsert do status mais recente de presença de um contato numa conexão —
 * eventos de presença da Z-API (PresenceChatCallback) podem repetir ou
 * chegar fora de ordem; como só guardamos o estado atual (não histórico),
 * um upsert simples por (connectionId, phone) já é idempotente por
 * natureza, sem precisar de nenhuma checagem extra de dedup. */
export function upsertContactPresence(
  connectionId: string,
  phone: string,
  data: { status: string; lastSeen: Date | null }
) {
  return prisma.contactPresence.upsert({
    where: { connectionId_phone: { connectionId, phone } },
    create: { connectionId, phone, ...data },
    update: data,
  });
}

/** Último status conhecido de um contato numa conexão — `null` quando a
 * Z-API nunca mandou nenhum evento de presença pra esse telefone (comum:
 * depende da privacidade do contato no WhatsApp). */
export function getContactPresence(
  connectionId: string,
  phone: string
): Promise<ContactPresenceRow | null> {
  return prisma.contactPresence.findUnique({
    where: { connectionId_phone: { connectionId, phone } },
    select: { phone: true, status: true, lastSeen: true, updatedAt: true },
  });
}

/** Status de presença de vários telefones de uma vez (ex.: lista de
 * contatos) — telefones sem nenhum evento registrado simplesmente não
 * aparecem no retorno. */
export function listContactPresences(
  connectionId: string,
  phones: string[]
): Promise<ContactPresenceRow[]> {
  if (phones.length === 0) return Promise.resolve([]);
  return prisma.contactPresence.findMany({
    where: { connectionId, phone: { in: phones } },
    select: { phone: true, status: true, lastSeen: true, updatedAt: true },
  });
}
