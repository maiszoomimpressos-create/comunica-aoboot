import { prisma } from "@/lib/db/prisma";
import { Prisma, type BotConversationStatus, type BotMessageDirection } from "@/generated/prisma/client";

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
 * `reopened: true` tells the caller to drop the pre-reactivation history
 * from what's fed to the model — confirmed in practice that without this,
 * the old "já passei pro atendente humano" turn stays in context and the
 * model re-escalates almost immediately on the very next message, making a
 * reopened thread look stuck all over again. */
export async function getOrCreateActiveBotConversation(
  connectionId: string,
  contactPhone: string
): Promise<Prisma.BotConversationGetPayload<object> & { reopened: boolean }> {
  const existing = await prisma.botConversation.findUnique({
    where: { connectionId_contactPhone: { connectionId, contactPhone } },
  });
  if (!existing) {
    const created = await prisma.botConversation.create({ data: { connectionId, contactPhone } });
    return { ...created, reopened: false };
  }
  if (existing.status === "CLOSED" || existing.status === "ESCALATED") {
    const reopened = await prisma.botConversation.update({
      where: { id: existing.id },
      data: { status: "ACTIVE" },
    });
    return { ...reopened, reopened: true };
  }
  return { ...existing, reopened: false };
}

export function setBotConversationStatus(conversationId: string, status: BotConversationStatus) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { status, lastMessageAt: new Date() },
  });
}

export function touchBotConversation(conversationId: string) {
  return prisma.botConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
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
