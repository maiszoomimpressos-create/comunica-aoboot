import { prisma } from "@/lib/db/prisma";

/** Fila persistida das imagens pós-corrida — ver RideReceiptFollowUp em
 * schema.prisma e ride-receipt-follow-up.service.ts. Mesmo esquema de lock
 * do CampaignRecipient (campaign.repository.ts). */

export interface CreateRideReceiptFollowUpInput {
  connectionId: string;
  toPhone: string;
  idempotencyKey: string;
  scheduledAt: Date;
  receiptMessageId: string | null;
}

/** Idempotente: um recibo repetido (mesma chave) não cria segunda linha. */
export async function createRideReceiptFollowUpIfAbsent(input: CreateRideReceiptFollowUpInput): Promise<boolean> {
  const result = await prisma.rideReceiptFollowUp.createMany({ data: [input], skipDuplicates: true });
  return result.count > 0;
}

/** Linhas presas em PROCESSING (o processo caiu no meio do envio) voltam pra
 * PENDING pro próximo tick tentar de novo. */
export function recoverStuckRideReceiptFollowUps(staleBefore: Date) {
  return prisma.rideReceiptFollowUp.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: { status: "PENDING", lockedAt: null },
  });
}

/** Reivindica em duas etapas (busca candidatos, depois updateMany
 * condicionado a PENDING) — dois ticks sobrepostos nunca pegam a mesma
 * linha. Já incrementa `attempts`. */
export async function claimDueRideReceiptFollowUps(now: Date, limit: number) {
  const due = await prisma.rideReceiptFollowUp.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (due.length === 0) return [];

  const ids = due.map((d) => d.id);
  await prisma.rideReceiptFollowUp.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
  });

  return prisma.rideReceiptFollowUp.findMany({
    where: { id: { in: ids }, status: "PROCESSING", lockedAt: now },
    include: {
      connection: {
        include: {
          provider: true,
          organization: { select: { name: true, messageBusinessName: true } },
          appPromoSettings: true,
        },
      },
    },
  });
}

export type ClaimedRideReceiptFollowUp = Awaited<ReturnType<typeof claimDueRideReceiptFollowUps>>[number];

export function markRideReceiptFollowUpSent(id: string, now: Date) {
  return prisma.rideReceiptFollowUp.update({
    where: { id },
    data: { status: "SENT", sentAt: now, lockedAt: null, lastError: null },
  });
}

export function markRideReceiptFollowUpFailed(id: string, errorMessage: string) {
  return prisma.rideReceiptFollowUp.update({
    where: { id },
    data: { status: "FAILED", lockedAt: null, lastError: errorMessage },
  });
}

export function markRideReceiptFollowUpCancelled(id: string, reason: string) {
  return prisma.rideReceiptFollowUp.update({
    where: { id },
    data: { status: "CANCELLED", lockedAt: null, lastError: reason },
  });
}

export function rescheduleRideReceiptFollowUp(id: string, scheduledAt: Date, errorMessage: string) {
  return prisma.rideReceiptFollowUp.update({
    where: { id },
    data: { status: "PENDING", lockedAt: null, scheduledAt, lastError: errorMessage },
  });
}
