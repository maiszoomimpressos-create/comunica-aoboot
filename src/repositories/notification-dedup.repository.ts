import { prisma } from "@/lib/db/prisma";
import { RECEIPT_DEDUP_IN_FLIGHT_STALE_MS, RECEIPT_DEDUP_WINDOW_MS } from "@/lib/notifications/receipt-dedup";

export type DedupClaim =
  | { claimed: true; id: string }
  | { claimed: false; messageId: string | null; inFlight: boolean };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** Tenta reservar a chave. Atômico pela chave única (connectionId, dedupKey). */
export async function claimNotificationDedup(connectionId: string, dedupKey: string, now = new Date()): Promise<DedupClaim> {
  // Fora da janela de 30 min, a chave antiga não vale mais.
  await prisma.notificationDedup.deleteMany({
    where: { connectionId, dedupKey, createdAt: { lt: new Date(now.getTime() - RECEIPT_DEDUP_WINDOW_MS) } },
  });
  try {
    const row = await prisma.notificationDedup.create({ data: { connectionId, dedupKey } });
    return { claimed: true, id: row.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const existing = await prisma.notificationDedup.findUnique({
    where: { connectionId_dedupKey: { connectionId, dedupKey } },
  });
  if (!existing) {
    // apagada entre o create e o find (falha do 1º envio) — tenta de novo uma vez
    try {
      const row = await prisma.notificationDedup.create({ data: { connectionId, dedupKey } });
      return { claimed: true, id: row.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { claimed: false, messageId: null, inFlight: true };
    }
  }
  if (existing.status === "SENDING" && existing.updatedAt.getTime() < now.getTime() - RECEIPT_DEDUP_IN_FLIGHT_STALE_MS) {
    // 1º envio morreu no meio: assume (condicional, só um consegue)
    const taken = await prisma.notificationDedup.updateMany({
      where: { id: existing.id, status: "SENDING", updatedAt: existing.updatedAt },
      data: { status: "SENDING" },
    });
    if (taken.count === 1) return { claimed: true, id: existing.id };
  }
  return { claimed: false, messageId: existing.messageId, inFlight: existing.status !== "SENT" };
}

export function markNotificationDedupSent(id: string, messageId: string | null) {
  return prisma.notificationDedup.update({ where: { id }, data: { status: "SENT", messageId } });
}

/** Envio falhou: libera a chave pra uma nova tentativa poder enviar. */
export function releaseNotificationDedup(id: string) {
  return prisma.notificationDedup.deleteMany({ where: { id } });
}

/** Limpeza oportunista (linhas fora da janela). */
export function purgeOldNotificationDedup(now = new Date()) {
  return prisma.notificationDedup.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 2 * RECEIPT_DEDUP_WINDOW_MS) } },
  });
}
