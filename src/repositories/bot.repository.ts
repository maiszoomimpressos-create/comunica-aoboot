import { prisma } from "@/lib/db/prisma";
import { Prisma, type BotMessageDirection } from "@/generated/prisma/client";

export function getBotConfig(connectionId: string) {
  return prisma.botConfig.findUnique({
    where: { connectionId },
    include: { vertical: { select: { systemPrompt: true } } },
  });
}

/** Atomic idempotency claim: `true` the first time this (connection,
 * messageId) pair is seen, `false` on every retry — the Z-API audio
 * webhook is confirmed (in production) to redeliver the same messageId a
 * few seconds apart, which doubled every reply before this existed.
 * Insert-and-catch-the-unique-violation, not check-then-insert, so there's
 * no race window between two near-simultaneous deliveries. */
export async function tryClaimInboundMessage(
  connectionId: string,
  messageId: string
): Promise<boolean> {
  try {
    await prisma.processedWebhookMessage.create({ data: { connectionId, messageId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/** Tenant-facing upsert — called from the dashboard toggle/perfil form (see
 * update-bot-config action). One row per connection, created on first save. */
export function upsertBotConfig(
  connectionId: string,
  data: { enabled: boolean; businessProfile: string | null; verticalId: string | null }
) {
  return prisma.botConfig.upsert({
    where: { connectionId },
    create: { connectionId, ...data },
    update: data,
  });
}

/** One conversation per (connection, contact phone) — reused across turns so
 * the bot keeps context. Reopens a CLOSED *or* ESCALATED thread as ACTIVE on
 * a new inbound message: ESCALATED used to stick forever (no code anywhere
 * ever moved it back), which silently muted the bot for that phone number
 * for good after a single handoff — confirmed in production, a contact
 * escalated hours earlier got zero reply to a brand new message. A new
 * message is read as "the customer needs help again", not "resume the old
 * request", so the bot picking it back up is the right default even if a
 * human happens to still be mid-handoff on WhatsApp itself.
 *
 * Reopening also bumps `contextStartAt` to now — the actual, persistent
 * "don't look before this" boundary `listRecentBotMessages`' result gets
 * filtered against on *every* turn (see handleInboundMessage), not just
 * this one. An earlier version only filtered history on the literal
 * reopening turn, which confirmed-broke one turn later: the very next
 * message after a reopen pulled the raw last-20 again, dragging an
 * already-closed request straight back into context.
 *
 * `reopenedFrom` tells the caller which state it reopened from — reopening
 * from ESCALATED additionally needs the check-in behavior (see
 * handleInboundMessage): the old request might genuinely still be
 * unresolved, so the bot asks instead of assuming either way — that's why
 * `pendingRequestSummary` deliberately survives an ESCALATED reopen and is
 * only cleared by `closeBotConversation`. */
export async function getOrCreateActiveBotConversation(
  connectionId: string,
  contactPhone: string
): Promise<Prisma.BotConversationGetPayload<object> & { reopenedFrom: "CLOSED" | "ESCALATED" | null }> {
  const existing = await prisma.botConversation.findUnique({
    where: { connectionId_contactPhone: { connectionId, contactPhone } },
  });
  if (!existing) {
    const created = await prisma.botConversation.create({ data: { connectionId, contactPhone } });
    return { ...created, reopenedFrom: null };
  }
  if (existing.status === "CLOSED" || existing.status === "ESCALATED") {
    const reopenedFrom = existing.status;
    const reopened = await prisma.botConversation.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", contextStartAt: new Date() },
    });
    return { ...reopened, reopenedFrom };
  }
  return { ...existing, reopenedFrom: null };
}

/** Escalates to a human, storing a short summary of the pending request
 * (from the model's own `escalarParaHumano` tool call) so a later reopen
 * can ask "isso já foi atendido?" instead of guessing — see
 * getOrCreateActiveBotConversation and the `encerrarPedido` tool. Doesn't
 * touch `contextStartAt`: the messages leading up to this escalation are
 * still relevant to it, the staleness problem only starts once the
 * conversation reopens later. */
export function escalateBotConversation(conversationId: string, pendingRequestSummary: string | null) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { status: "ESCALATED", pendingRequestSummary, lastMessageAt: new Date() },
  });
}

/** Marks the pending request resolved — called from the `encerrarPedido`
 * tool once the customer confirms. Clears `pendingRequestSummary` and also
 * bumps `contextStartAt`: the moment it's closed, nothing before it should
 * bleed into whatever the customer brings up next, even within the same
 * turn's reply. */
export function closeBotConversation(conversationId: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { status: "CLOSED", pendingRequestSummary: null, contextStartAt: new Date(), lastMessageAt: new Date() },
  });
}

export function touchBotConversation(conversationId: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
}

/** Começa (ou substitui) o acompanhamento de uma corrida/entrega nesta
 * conversa — ver checkOpenRideUpdate em bot-attendant.service.ts. */
export function setOpenRide(conversationId: string, rideId: string, status: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { openRideId: rideId, openRideStatus: status },
  });
}

export function updateOpenRideStatus(conversationId: string, status: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { openRideStatus: status },
  });
}

export function clearOpenRide(conversationId: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { openRideId: null, openRideStatus: null },
  });
}

export function createBotMessage(
  conversationId: string,
  direction: BotMessageDirection,
  body: string
) {
  return prisma.botMessage.create({ data: { conversationId, direction, body } });
}

/** Oldest-first, capped at `limit` most recent turns — fed to the model as
 * conversation history (see bot-attendant.service.ts). */
export async function listRecentBotMessages(conversationId: string, limit: number) {
  const rows = await prisma.botMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

/** Apaga todo pedido via WhatsApp (conversa + mensagens) gerado antes de
 * `cutoff` — ver data-retention.service.ts (90 dias, pedido do tenant).
 * `onDelete: Cascade` em BotMessage/RelaySession/RelaySessionClaim
 * (schema.prisma) já leva o resto junto, um `deleteMany` só na conversa
 * basta. */
export function deleteBotConversationsCreatedBefore(cutoff: Date) {
  return prisma.botConversation.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}
