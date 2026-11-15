import { prisma } from "@/lib/db/prisma";

/**
 * Acesso às tabelas `advertisement` / `advertisement_delivery`
 * (migration 20261115040000_add_advertisements). Enquanto a migration não
 * for aplicada, as consultas falham com P2021 — quem chama trata isso
 * (isMissingTableError) e o recibo nunca é afetado.
 */

export interface AdvertisementWriteData {
  name: string;
  imageUrl: string | null;
  messageText: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  triggerTypeKeys: string[];
  frequencyMode: string;
  frequencyValue: number;
  deleteAfterHours: number | null;
}

export function listAdvertisementsForTenant(tenantId: string) {
  return prisma.advertisement.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export function getAdvertisementForTenant(tenantId: string, id: string) {
  return prisma.advertisement.findFirst({ where: { id, tenantId } });
}

export function createAdvertisement(tenantId: string, connectionId: string, data: AdvertisementWriteData) {
  return prisma.advertisement.create({ data: { ...data, tenantId, connectionId } });
}

export function updateAdvertisement(tenantId: string, id: string, data: AdvertisementWriteData & { connectionId: string }) {
  return prisma.advertisement.updateMany({ where: { id, tenantId }, data });
}

export function setAdvertisementActive(tenantId: string, id: string, active: boolean) {
  return prisma.advertisement.updateMany({ where: { id, tenantId }, data: { active } });
}

export function deleteAdvertisement(tenantId: string, id: string) {
  return prisma.advertisement.deleteMany({ where: { id, tenantId } });
}

/** Enviados (e com falha) por publicidade — relatório simples da tela. */
export async function countDeliveriesByAdvertisement(tenantId: string, since?: Date) {
  const rows = await prisma.advertisementDelivery.groupBy({
    by: ["advertisementId", "status"],
    where: { advertisement: { tenantId }, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
  });
  const out = new Map<string, { sent: number; failed: number }>();
  for (const row of rows) {
    const entry = out.get(row.advertisementId) ?? { sent: 0, failed: 0 };
    if (row.status === "SENT") entry.sent += row._count._all;
    else entry.failed += row._count._all;
    out.set(row.advertisementId, entry);
  }
  return out;
}

/** Candidatas para este envio (o filtro fino de período/frequência é puro,
 * em advertisement-rules.ts). */
export function listTriggeredAdvertisements(connectionId: string, notificationType: string) {
  return prisma.advertisement.findMany({
    where: { connectionId, active: true, triggerTypeKeys: { has: notificationType } },
  });
}

export async function loadRecipientAdDeliveries(connectionId: string, contactKey: string, since: Date) {
  const [last, last24hCount] = await Promise.all([
    prisma.advertisementDelivery.findFirst({
      where: { connectionId, contactKey, status: "SENT" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.advertisementDelivery.count({
      where: { connectionId, contactKey, status: "SENT", createdAt: { gte: since } },
    }),
  ]);
  return { lastSentAt: last?.createdAt ?? null, last24hCount };
}

export interface AdvertisementDeliveryInput {
  advertisementId: string;
  connectionId: string;
  contactKey: string;
  recipientPhone: string | null;
  notificationType: string;
  status: "SENT" | "FAILED";
  messageIds: string[];
  error: string | null;
  deleteAt: Date | null;
}

export function createAdvertisementDelivery(data: AdvertisementDeliveryInput) {
  return prisma.advertisementDelivery.create({ data });
}

export function markAdvertisementSent(id: string, at: Date) {
  return prisma.advertisement.update({ where: { id }, data: { lastSentAt: at } });
}

export function listDueAdvertisementDeletions(now: Date, limit: number) {
  return prisma.advertisementDelivery.findMany({
    where: { status: "SENT", deletedAt: null, deleteAt: { lte: now }, deleteAttempts: { lt: 3 } },
    orderBy: { deleteAt: "asc" },
    take: limit,
  });
}

export function markAdvertisementDeliveryDeleted(id: string, at: Date) {
  return prisma.advertisementDelivery.update({
    where: { id },
    data: { deletedAt: at, recipientPhone: null, deleteError: null },
  });
}

/** `giveUp` = passou da janela do WhatsApp: não tenta mais e limpa o telefone. */
export function markAdvertisementDeliveryDeleteFailed(id: string, error: string, giveUp: boolean) {
  return prisma.advertisementDelivery.update({
    where: { id },
    data: {
      deleteError: error.slice(0, 500),
      deleteAttempts: giveUp ? 3 : { increment: 1 },
      ...(giveUp ? { recipientPhone: null } : {}),
    },
  });
}
