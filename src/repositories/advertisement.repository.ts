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
    // PENDING/SENDING (aguardando o recibo chegar), EXPIRED e SKIPPED não
    // contam como enviadas nem como falha.
    if (row.status === "SENT") entry.sent += row._count._all;
    else if (row.status === "FAILED") entry.failed += row._count._all;
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

/** Enviadas + na fila (PENDING/SENDING): a fila também conta no limite,
 * para dois recibos seguidos não gerarem duas publicidades. */
const COUNTED_STATUSES = ["SENT", "PENDING", "SENDING"];

export async function loadRecipientAdDeliveries(connectionId: string, contactKey: string, since: Date) {
  const [last, last24hCount] = await Promise.all([
    prisma.advertisementDelivery.findFirst({
      where: { connectionId, contactKey, status: { in: COUNTED_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.advertisementDelivery.count({
      where: { connectionId, contactKey, status: { in: COUNTED_STATUSES }, createdAt: { gte: since } },
    }),
  ]);
  return { lastSentAt: last?.createdAt ?? null, last24hCount };
}

/**
 * Ciclo de uma linha de advertisement_delivery (sem coluna nova):
 * - PENDING: recibo enviado, esperando o status RECEIVED. `messageIds` guarda
 *   o id do RECIBO e `recipientPhone` o destino;
 * - SENDING: reservada por quem vai enviar (garante uma só por recibo);
 * - SENT / FAILED: `messageIds` passa a ser o(s) id(s) da PUBLICIDADE;
 * - EXPIRED: o recibo não confirmou entrega em 30 min — não envia;
 * - SKIPPED: na hora de enviar, a publicidade foi pausada/encerrada ou o
 *   contato pausou/bloqueou.
 */
export type AdvertisementDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "EXPIRED" | "SKIPPED";

export interface AdvertisementDeliveryInput {
  advertisementId: string;
  connectionId: string;
  contactKey: string;
  recipientPhone: string | null;
  notificationType: string;
  status: AdvertisementDeliveryStatus;
  messageIds: string[];
  error: string | null;
  deleteAt: Date | null;
}

export function createAdvertisementDelivery(data: AdvertisementDeliveryInput) {
  return prisma.advertisementDelivery.create({ data, select: { id: true } });
}

export interface PendingAdvertisementDelivery {
  id: string;
  advertisementId: string;
  connectionId: string;
  contactKey: string;
  recipientPhone: string | null;
  notificationType: string;
  status: string;
  messageIds: string[];
  createdAt: Date;
}

const PENDING_SELECT = {
  id: true,
  advertisementId: true,
  connectionId: true,
  contactKey: true,
  recipientPhone: true,
  notificationType: true,
  status: true,
  messageIds: true,
  createdAt: true,
} as const;

export function getAdvertisementDelivery(id: string): Promise<PendingAdvertisementDelivery | null> {
  return prisma.advertisementDelivery.findUnique({ where: { id }, select: PENDING_SELECT });
}

/** Já existe publicidade para este recibo? (uma só por recibo) */
export async function hasDeliveryForReceipt(connectionId: string, receiptMessageId: string, since: Date) {
  const row = await prisma.advertisementDelivery.findFirst({
    where: { connectionId, messageIds: { has: receiptMessageId }, createdAt: { gte: since } },
    select: { id: true },
  });
  return !!row;
}

export function findPendingDeliveriesByReceiptIds(connectionId: string, receiptMessageIds: string[]) {
  return prisma.advertisementDelivery.findMany({
    where: { connectionId, status: "PENDING", messageIds: { hasSome: receiptMessageIds } },
    select: PENDING_SELECT,
    take: 10,
  });
}

export function listPendingAdvertisementDeliveries(limit: number) {
  return prisma.advertisementDelivery.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: PENDING_SELECT,
    take: limit,
  });
}

/** Reserva para envio: só um (after() do webhook ou cron) ganha. */
export async function claimAdvertisementDelivery(id: string): Promise<boolean> {
  const res = await prisma.advertisementDelivery.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "SENDING" },
  });
  return res.count === 1;
}

export async function expireAdvertisementDelivery(id: string, error: string): Promise<boolean> {
  const res = await prisma.advertisementDelivery.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "EXPIRED", error: error.slice(0, 500), recipientPhone: null },
  });
  return res.count === 1;
}

export function finishAdvertisementDelivery(
  id: string,
  data: { status: "SENT" | "FAILED" | "SKIPPED"; messageIds: string[]; recipientPhone: string | null; error: string | null; deleteAt: Date | null }
) {
  return prisma.advertisementDelivery.updateMany({
    where: { id, status: "SENDING" },
    data: { ...data, error: data.error?.slice(0, 500) ?? null },
  });
}

/** SENDING parado (função caiu no meio): vira FAILED, sem reenviar. */
export function failStuckAdvertisementDeliveries(before: Date) {
  return prisma.advertisementDelivery.updateMany({
    where: { status: "SENDING", createdAt: { lt: before } },
    data: { status: "FAILED", error: "Envio interrompido; não foi reenviado.", recipientPhone: null },
  });
}

export function getAdvertisementById(id: string) {
  return prisma.advertisement.findUnique({ where: { id } });
}

/**
 * Quando o recibo chegou no aparelho: primeiro status RECEIVED/READ/PLAYED
 * desse messageId gravado em webhook_event (o webhook grava tudo).
 */
export async function findReceiptDeliveredAt(
  connectionId: string,
  receiptMessageId: string,
  since: Date,
  statuses: readonly string[]
): Promise<Date | null> {
  const row = await prisma.webhookEvent.findFirst({
    where: {
      connectionId,
      receivedAt: { gte: since },
      AND: [
        { payload: { path: ["type"], equals: "MessageStatusCallback" } },
        { payload: { path: ["ids"], array_contains: [receiptMessageId] } },
        { OR: statuses.map((s) => ({ payload: { path: ["status"], equals: s } })) },
      ],
    },
    orderBy: { receivedAt: "asc" },
    select: { receivedAt: true },
  });
  return row?.receivedAt ?? null;
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
