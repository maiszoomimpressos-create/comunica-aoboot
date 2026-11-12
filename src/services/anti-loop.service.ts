import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  AUTO_PAUSE_SETOR_DESCRIPTION,
  AUTO_PAUSE_SETOR_NAME,
  AUTO_REPLY_DAY_WINDOW_MS,
  AUTO_REPLY_HOUR_WINDOW_MS,
  AUTO_REPLY_WINDOW_MS,
  INBOUND_FLOOD_WINDOW_MS,
  MAX_AUTO_REPLIES_PER_MINUTE,
  autoReplyPhoneMatches,
  countRecentAutoReplies,
  detectAutomaticSender,
  evaluateLongWindowCap,
  formatPauseReason,
  maskContactPhone,
  type AutoReplySample,
  type DetectionResult,
  type InboundSample,
  type LongWindowCounts,
} from "@/lib/whatsapp/anti-loop";

const RELAY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRelayCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) code += RELAY_CODE_CHARS[Math.floor(Math.random() * RELAY_CODE_CHARS.length)];
  return code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function payloadText(payload: Record<string, unknown>): string | null {
  const text = isRecord(payload.text) ? payload.text.message : payload.text;
  return typeof text === "string" && text.trim() ? text : typeof text === "string" ? text : null;
}

async function loadRecentWebhookEvents(connectionId: string, since: Date) {
  return prisma.webhookEvent.findMany({
    where: { connectionId, receivedAt: { gte: since } },
    select: { receivedAt: true, payload: true },
    orderBy: { receivedAt: "asc" },
  });
}

function inboundSamplesForContact(
  events: { receivedAt: Date; payload: unknown }[],
  contactPhone: string
): InboundSample[] {
  const contactDigits = contactPhone.replace(/\D/g, "");
  const samples: InboundSample[] = [];
  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : null;
    if (!payload || payload.type !== "ReceivedCallback" || payload.fromMe === true) continue;
    const phone = typeof payload.phone === "string" ? payload.phone : "";
    if (phone.replace(/\D/g, "") !== contactDigits) continue;
    const chatName = typeof payload.chatName === "string" && payload.chatName.trim() ? payload.chatName.trim() : null;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    samples.push({ at: event.receivedAt, text: payloadText(payload), chatName, messageId });
  }
  return samples;
}

function sentSamples(events: { receivedAt: Date; payload: unknown }[]): AutoReplySample[] {
  const samples: AutoReplySample[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : null;
    if (!payload || payload.type !== "MessageStatusCallback") continue;
    if (payload.status !== "SENT") continue;
    const phone = typeof payload.phone === "string" ? payload.phone : "";
    if (!phone) continue;
    const id = Array.isArray(payload.ids) && typeof payload.ids[0] === "string" ? payload.ids[0] : null;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    samples.push({ at: event.receivedAt, phone });
  }
  return samples;
}

/**
 * Contagem em janela de 1h e 24h direto no banco (sem carregar payloads):
 * mensagens recebidas do contato (messageId distinto) e mensagens enviadas
 * a ele (status SENT, pelo número ou pelo LID). Usa o índice
 * (connectionId, receivedAt) do webhook_event.
 */
export async function loadLongWindowCounts(
  connectionId: string,
  contactPhone: string,
  chatLid: string | null | undefined,
  now: Date
): Promise<LongWindowCounts> {
  const phoneDigits = contactPhone.replace(/\D/g, "");
  const lidDigits = (chatLid ?? "").replace(/\D/g, "") || phoneDigits;
  const since1h = new Date(now.getTime() - AUTO_REPLY_HOUR_WINDOW_MS);
  const since24h = new Date(now.getTime() - AUTO_REPLY_DAY_WINDOW_MS);
  const rows = await prisma.$queryRaw<
    { inbound1h: number; sent1h: number; inbound24h: number; sent24h: number }[]
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT payload->>'messageId') FILTER (
        WHERE payload->>'type' = 'ReceivedCallback'
          AND COALESCE(payload->>'fromMe', 'false') <> 'true'
          AND regexp_replace(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g') = ${phoneDigits}
          AND "receivedAt" >= ${since1h}
      )::int AS "inbound1h",
      COUNT(DISTINCT payload->>'messageId') FILTER (
        WHERE payload->>'type' = 'ReceivedCallback'
          AND COALESCE(payload->>'fromMe', 'false') <> 'true'
          AND regexp_replace(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g') = ${phoneDigits}
      )::int AS "inbound24h",
      COUNT(DISTINCT payload->'ids'->>0) FILTER (
        WHERE payload->>'type' = 'MessageStatusCallback'
          AND payload->>'status' = 'SENT'
          AND regexp_replace(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g') IN (${phoneDigits}, ${lidDigits})
          AND "receivedAt" >= ${since1h}
      )::int AS "sent1h",
      COUNT(DISTINCT payload->'ids'->>0) FILTER (
        WHERE payload->>'type' = 'MessageStatusCallback'
          AND payload->>'status' = 'SENT'
          AND regexp_replace(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g') IN (${phoneDigits}, ${lidDigits})
      )::int AS "sent24h"
    FROM webhook_event
    WHERE "connectionId" = ${connectionId}
      AND "receivedAt" >= ${since24h}
      AND "receivedAt" <= ${now}
  `);
  const row = rows[0];
  return {
    inbound1h: Number(row?.inbound1h ?? 0),
    sent1h: Number(row?.sent1h ?? 0),
    inbound24h: Number(row?.inbound24h ?? 0),
    sent24h: Number(row?.sent24h ?? 0),
  };
}

/**
 * Checagem leve só do teto por minuto (sem detecção nem pausa), para
 * respostas automáticas fora do fluxo/IA — ex.: o aviso "só repasso texto"
 * do repasse humano. Nunca lança; em erro, não bloqueia.
 */
export async function isAutoReplyRateLimited(params: {
  connectionId: string;
  fromPhone: string;
  chatLid?: string | null;
}): Promise<boolean> {
  try {
    const now = new Date();
    const events = await loadRecentWebhookEvents(params.connectionId, new Date(now.getTime() - AUTO_REPLY_WINDOW_MS));
    const sent = countRecentAutoReplies(sentSamples(events), params.fromPhone, params.chatLid, now, AUTO_REPLY_WINDOW_MS);
    return sent >= MAX_AUTO_REPLIES_PER_MINUTE;
  } catch (err) {
    await logBotEvent("error", "auto_reply_rate_check_failed", {
      connectionId: params.connectionId,
      fromPhone: params.fromPhone,
      error: serializeError(err),
    });
    return false;
  }
}

export async function findAutoPauseSetor(connectionId: string) {
  return prisma.setor.findFirst({
    where: { connectionId, name: AUTO_PAUSE_SETOR_NAME },
  });
}

export async function getOrCreateAutoPauseSetor(connectionId: string, tenantId: string) {
  const existing = await findAutoPauseSetor(connectionId);
  if (existing) return existing;
  try {
    return await prisma.setor.create({
      data: {
        connectionId,
        tenantId,
        name: AUTO_PAUSE_SETOR_NAME,
        description: AUTO_PAUSE_SETOR_DESCRIPTION,
        active: false,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await findAutoPauseSetor(connectionId);
      if (raced) return raced;
    }
    throw err;
  }
}

export async function findLiveAutoPauseSession(connectionId: string, contactPhone: string) {
  const setor = await findAutoPauseSetor(connectionId);
  if (!setor) return null;
  return prisma.relaySession.findFirst({
    where: {
      connectionId,
      setorId: setor.id,
      customerPhone: contactPhone,
      status: { in: ["PENDING", "ACTIVE"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function recordAuditLog(data: {
  action: string;
  tenantId: string;
  targetId: string;
  metadata: Prisma.InputJsonValue;
  actorUserId?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      action: data.action,
      targetType: "relay_session",
      targetId: data.targetId,
      tenantId: data.tenantId,
      actorUserId: data.actorUserId ?? null,
      metadata: data.metadata,
    },
  });
}

export async function persistAutomaticReplyPause(params: {
  connectionId: string;
  fromPhone: string;
  detection: DetectionResult;
}): Promise<{ relaySessionId: string; created: boolean }> {
  const { connectionId, fromPhone, detection } = params;
  const existing = await findLiveAutoPauseSession(connectionId, fromPhone);
  if (existing) return { relaySessionId: existing.id, created: false };

  const connection = await prisma.channelConnection.findUnique({
    where: { id: connectionId },
    select: { tenantId: true },
  });
  if (!connection) throw new Error(`conexão não encontrada: ${connectionId}`);

  const reason = formatPauseReason(detection);
  const setor = await getOrCreateAutoPauseSetor(connectionId, connection.tenantId);

  const conversation = await prisma.botConversation.upsert({
    where: { connectionId_contactPhone: { connectionId, contactPhone: fromPhone } },
    create: {
      connectionId,
      contactPhone: fromPhone,
      status: "ESCALATED",
      pendingRequestSummary: reason,
    },
    update: {
      status: "ESCALATED",
      pendingRequestSummary: reason,
    },
  });

  let relay = await findLiveAutoPauseSession(connectionId, fromPhone);
  if (!relay) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        relay = await prisma.relaySession.create({
          data: {
            connectionId,
            setorId: setor.id,
            conversationId: conversation.id,
            customerPhone: fromPhone,
            broadcastedTo: [],
            status: "PENDING",
            code: randomRelayCode(),
          },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
  }
  if (!relay) throw new Error("não foi possível criar a sessão de pausa automática");

  await recordAuditLog({
    action: "whatsapp.auto_reply_paused",
    tenantId: connection.tenantId,
    targetId: relay.id,
    metadata: {
      connectionId,
      contactPhone: fromPhone,
      contactPhoneMasked: maskContactPhone(fromPhone),
      chatName: detection.signals.chatName,
      reasons: detection.reasons,
      signals: detection.signals,
      relaySessionId: relay.id,
    },
  });

  return { relaySessionId: relay.id, created: true };
}

export type InterceptAutomaticReplyResult = {
  skip: boolean;
  reason: "detected" | "rate_limited" | null;
};

/**
 * Chamado depois do relay humano/pausa já existente e antes do fluxo/IA.
 * Se detectar robô, persiste a pausa (RelaySession PENDING) e não responde.
 * Independente disso, aplica o teto de respostas automáticas por minuto.
 * Nunca lança: uma falha aqui não pode derrubar o pipeline nem disparar resposta.
 */
export async function interceptAutomaticReply(params: {
  connectionId: string;
  fromPhone: string;
  customerName: string | null;
  chatLid?: string | null;
}): Promise<InterceptAutomaticReplyResult> {
  const { connectionId, fromPhone, customerName, chatLid } = params;
  try {
    const alreadyPaused = await findLiveAutoPauseSession(connectionId, fromPhone);
    if (alreadyPaused) {
      await logBotEvent("info", "auto_reply_already_paused", {
        connectionId,
        fromPhone,
        relaySessionId: alreadyPaused.id,
      });
      return { skip: true, reason: "detected" };
    }

    const now = new Date();
    const events = await loadRecentWebhookEvents(
      connectionId,
      new Date(now.getTime() - INBOUND_FLOOD_WINDOW_MS)
    );
    const inbound = inboundSamplesForContact(events, fromPhone);
    if (customerName && inbound.length > 0) {
      const last = inbound[inbound.length - 1];
      if (!last.chatName) inbound[inbound.length - 1] = { ...last, chatName: customerName };
    }
    const sentToContact = sentSamples(events)
      .filter((s) => autoReplyPhoneMatches(s.phone, fromPhone, chatLid))
      .map((s) => s.at);
    let detection = detectAutomaticSender(inbound, now, { sentAt: sentToContact });

    // Teto de 1h/24h: pega o loop lento que nunca estoura 60s/5min.
    if (!detection.detected) {
      try {
        const counts = await loadLongWindowCounts(connectionId, fromPhone, chatLid, now);
        const capReason = evaluateLongWindowCap(counts);
        if (capReason) {
          detection = { ...detection, detected: true, reasons: [capReason] };
        }
      } catch (err) {
        await logBotEvent("error", "auto_reply_long_window_failed", {
          connectionId,
          fromPhone,
          error: serializeError(err),
        });
      }
    }

    if (detection.detected) {
      try {
        const pause = await persistAutomaticReplyPause({ connectionId, fromPhone, detection });
        await logBotEvent("warn", "auto_reply_paused", {
          connectionId,
          fromPhone,
          relaySessionId: pause.relaySessionId,
          reasons: detection.reasons,
          signals: detection.signals,
        });
      } catch (err) {
        await logBotEvent("error", "auto_reply_pause_persist_failed", {
          connectionId,
          fromPhone,
          reasons: detection.reasons,
          error: serializeError(err),
        });
      }
      return { skip: true, reason: "detected" };
    }

    const sent = countRecentAutoReplies(sentSamples(events), fromPhone, chatLid, now, AUTO_REPLY_WINDOW_MS);
    if (sent >= MAX_AUTO_REPLIES_PER_MINUTE) {
      await logBotEvent("warn", "auto_reply_rate_limited", {
        connectionId,
        fromPhone,
        sentLast60s: sent,
        maxPerMinute: MAX_AUTO_REPLIES_PER_MINUTE,
      });
      return { skip: true, reason: "rate_limited" };
    }

    return { skip: false, reason: null };
  } catch (err) {
    await logBotEvent("error", "auto_reply_intercept_failed", {
      connectionId,
      fromPhone,
      error: serializeError(err),
    });
    return { skip: false, reason: null };
  }
}

export type PausedAutomaticReply = {
  relaySessionId: string;
  conversationId: string;
  contactPhoneMasked: string;
  reason: string | null;
  pausedAt: string;
};

export async function listPausedAutomaticReplies(connectionId: string): Promise<PausedAutomaticReply[]> {
  const setor = await findAutoPauseSetor(connectionId);
  if (!setor) return [];
  const rows = await prisma.relaySession.findMany({
    where: { connectionId, setorId: setor.id, status: { in: ["PENDING", "ACTIVE"] } },
    include: { conversation: { select: { pendingRequestSummary: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    relaySessionId: row.id,
    conversationId: row.conversationId,
    contactPhoneMasked: maskContactPhone(row.customerPhone),
    reason: row.conversation.pendingRequestSummary,
    pausedAt: row.createdAt.toISOString(),
  }));
}

export async function unpauseAutomaticReply(params: {
  tenantId: string;
  connectionId: string;
  relaySessionId: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { tenantId, connectionId, relaySessionId, actorUserId } = params;
  const setor = await findAutoPauseSetor(connectionId);
  if (!setor) throw new NotFoundError("Não há pausas automáticas nesta conexão.");

  const session = await prisma.relaySession.findFirst({
    where: {
      id: relaySessionId,
      connectionId,
      setorId: setor.id,
      status: { in: ["PENDING", "ACTIVE"] },
    },
  });
  if (!session) throw new NotFoundError("Pausa não encontrada ou já removida.");

  const connection = await prisma.channelConnection.findFirst({
    where: { id: connectionId, tenantId },
    select: { id: true },
  });
  if (!connection) throw new ValidationError("Conexão não encontrada.");

  await prisma.relaySession.update({
    where: { id: session.id },
    data: { status: "CLOSED", closedAt: new Date(), closeReason: "manual_unpause" },
  });

  await prisma.botConversation.updateMany({
    where: { id: session.conversationId, connectionId },
    data: { status: "CLOSED", pendingRequestSummary: null },
  });

  await recordAuditLog({
    action: "whatsapp.auto_reply_unpaused",
    tenantId,
    targetId: session.id,
    actorUserId,
    metadata: {
      connectionId,
      contactPhone: session.customerPhone,
      contactPhoneMasked: maskContactPhone(session.customerPhone),
      relaySessionId: session.id,
    },
  });

  await logBotEvent("info", "auto_reply_unpaused", {
    connectionId,
    fromPhone: session.customerPhone,
    relaySessionId: session.id,
  });
}
