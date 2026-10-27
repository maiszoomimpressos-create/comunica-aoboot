import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1, pra não confundir no WhatsApp

function randomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

/** Cria a RelaySession em PENDING com um `code` curto único — insere e tenta
 * de novo em colisão de código (mesmo idioma insert-and-catch de
 * tryClaimRelaySession/tryClaimInboundMessage, só que retry em loop porque
 * aqui quem colide é o valor gerado, não uma segunda tentativa do mesmo
 * evento). `broadcastedTo` é o snapshot do pool no momento do broadcast. */
export async function createPendingRelaySession(data: {
  connectionId: string;
  setorId: string;
  conversationId: string;
  customerPhone: string;
  broadcastedTo: string[];
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.relaySession.create({
        data: { ...data, code: randomCode() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Não foi possível gerar um código único pra sessão de relay depois de várias tentativas.");
}

/** Gate atômico "primeira resposta ganha" — espelha tryClaimInboundMessage:
 * insert-and-catch a violação de unique em `relaySessionId`, nunca
 * check-then-update, então duas respostas quase simultâneas nunca passam as
 * duas. A transação só garante que ninguém lê "claim criado mas
 * RelaySession.status ainda PENDING" no meio do caminho. */
export async function tryClaimRelaySession(relaySessionId: string, attendantPhone: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.relaySessionClaim.create({ data: { relaySessionId, attendantPhone } });
      await tx.relaySession.update({
        where: { id: relaySessionId },
        data: { status: "ACTIVE", claimedByPhone: attendantPhone, claimedAt: new Date(), lastActivityAt: new Date() },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/** Lado cliente: sessão viva (PENDING ou ACTIVE) pra esse telefone nesta
 * conexão. No máximo uma pode estar "viva" por vez pro mesmo cliente —
 * não reforçado por unique constraint (uma sessão PENDING sem claim não
 * bloqueia a próxima escalação teoricamente), mas handleInboundMessage só
 * escala quando a conversa está ACTIVE, e createAndBroadcastRelaySession só
 * roda nesse momento — then-first-wins na prática. */
export function findLiveSessionByCustomerPhone(connectionId: string, customerPhone: string) {
  return prisma.relaySession.findFirst({
    where: { connectionId, customerPhone, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });
}

export function findActiveSessionByAttendantPhone(connectionId: string, attendantPhone: string) {
  return prisma.relaySession.findFirst({
    where: { connectionId, claimedByPhone: attendantPhone, status: "ACTIVE" },
  });
}

/** Sessões PENDING cujo setor tem esse telefone no pool — join via
 * SetorAttendant, usado pelo passo 3 de tryHandleRelayMessage (ver
 * relay-session.service.ts) pra decidir se quem escreveu é um atendente com
 * algo pra reivindicar. */
export async function findPendingSessionsForAttendant(connectionId: string, attendantPhone: string) {
  return prisma.relaySession.findMany({
    where: {
      connectionId,
      status: "PENDING",
      setor: { attendants: { some: { phone: attendantPhone, active: true } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function findRelaySessionByCode(connectionId: string, code: string) {
  return prisma.relaySession.findFirst({ where: { connectionId, code } });
}

export function bumpRelaySessionActivity(id: string) {
  return prisma.relaySession.update({ where: { id }, data: { lastActivityAt: new Date() } });
}

export function closeRelaySession(id: string, closeReason: string) {
  return prisma.relaySession.update({
    where: { id },
    data: { status: "CLOSED", closedAt: new Date(), closeReason },
  });
}

/** Usado pelo cron de timeout (fase 2) — sessões PENDING/ACTIVE paradas há
 * mais tempo do que o limite. */
export function findStaleRelaySessions(status: "PENDING" | "ACTIVE", olderThan: Date) {
  return prisma.relaySession.findMany({
    where: { status, lastActivityAt: { lt: olderThan } },
    include: { setor: true },
  });
}
