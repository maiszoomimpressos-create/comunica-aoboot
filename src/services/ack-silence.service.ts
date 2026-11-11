import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import { maskContactPhone } from "@/lib/whatsapp/anti-loop";
import {
  ACK_SILENCE_WINDOW_MS,
  canonicalContactDigits,
  classifyAckReply,
} from "@/lib/whatsapp/ack-reply";

/**
 * Silêncio pós-notificação (ver lib/whatsapp/ack-reply.ts).
 *
 * Sem tabela nova e sem migração: cada envio de notificação bem-sucedido
 * grava um AuditLog `whatsapp.notification_sent` com `targetId` = chave do
 * contato (hash do telefone + conexão, nunca o número em claro). No inbound,
 * se a mensagem é só agradecimento/cumprimento e existe um envio desses
 * nas últimas ACK_SILENCE_WINDOW_MS, o bot não responde.
 */

export const NOTIFICATION_SENT_ACTION = "whatsapp.notification_sent";
export const ACK_SILENCED_ACTION = "whatsapp.ack_reply_silenced";
const CONTACT_TARGET_TYPE = "whatsapp_contact";

/** Chave estável e não reversível do contato nesta conexão. */
export function contactTargetKey(connectionId: string, phone: string): string | null {
  const digits = canonicalContactDigits(phone);
  if (digits.length < 8) return null;
  const hash = createHash("sha256").update(`${connectionId}:${digits}`).digest("hex").slice(0, 40);
  return `wa:${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractMessageId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const id = raw.messageId ?? raw.zaapId ?? raw.id;
  return typeof id === "string" && id ? id : null;
}

/** Best-effort: nunca lança, nunca bloqueia o envio. */
export async function recordNotificationSent(params: {
  connectionId: string;
  tenantId: string;
  to: string;
  notificationType: string;
  result: { ok: boolean; raw?: unknown };
}): Promise<void> {
  const { connectionId, tenantId, to, notificationType, result } = params;
  if (!result.ok) return;
  try {
    const targetId = contactTargetKey(connectionId, to);
    if (!targetId) return;
    await prisma.auditLog.create({
      data: {
        action: NOTIFICATION_SENT_ACTION,
        targetType: CONTACT_TARGET_TYPE,
        targetId,
        tenantId,
        metadata: {
          connectionId,
          notificationType,
          contactPhoneMasked: maskContactPhone(canonicalContactDigits(to)),
          messageId: extractMessageId(result.raw),
        },
      },
    });
  } catch (err) {
    await logBotEvent("error", "notification_sent_record_failed", {
      connectionId,
      notificationType,
      error: serializeError(err),
    });
  }
}

export type AckSilenceInput = {
  connectionId: string;
  fromPhone: string;
  text: string | null;
  /** Figurinha/reação sem texto - conta como reconhecimento. */
  nonTextAck?: "sticker" | "reaction" | null;
};

export type AckSilenceResult = { skip: boolean };

/**
 * Chamado depois do relay humano e do anti-loop, antes do fluxo/IA.
 * Nunca lança: qualquer falha deixa o atendimento seguir normalmente.
 */
export async function interceptAckReplyAfterNotification(input: AckSilenceInput): Promise<AckSilenceResult> {
  const { connectionId, fromPhone, text, nonTextAck } = input;
  try {
    const classification = nonTextAck
      ? ({ ack: true, kind: nonTextAck } as const)
      : classifyAckReply(text);
    if (!classification.ack) return { skip: false };

    const targetId = contactTargetKey(connectionId, fromPhone);
    if (!targetId) return { skip: false };

    const connection = await prisma.channelConnection.findUnique({
      where: { id: connectionId },
      select: { tenantId: true },
    });
    if (!connection) return { skip: false };

    const now = new Date();
    const notification = await prisma.auditLog.findFirst({
      where: {
        tenantId: connection.tenantId,
        action: NOTIFICATION_SENT_ACTION,
        targetId,
        createdAt: { gte: new Date(now.getTime() - ACK_SILENCE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, metadata: true },
    });
    if (!notification) return { skip: false };

    // Já existe conversa em andamento depois da notificação (bot/fluxo
    // respondeu, ou está escalada pra humano): não mexe no comportamento.
    const conversation = await prisma.botConversation.findUnique({
      where: { connectionId_contactPhone: { connectionId, contactPhone: fromPhone } },
      select: { id: true, status: true },
    });
    if (conversation?.status === "ESCALATED") return { skip: false };
    if (conversation) {
      const botRepliedAfter = await prisma.botMessage.findFirst({
        where: { conversationId: conversation.id, direction: "OUT", createdAt: { gt: notification.createdAt } },
        select: { id: true },
      });
      if (botRepliedAfter) return { skip: false };
    }
    const flowAfter = await prisma.flowSession.findFirst({
      where: { connectionId, contactPhone: fromPhone, status: "ACTIVE", updatedAt: { gt: notification.createdAt } },
      select: { id: true },
    });
    if (flowAfter) return { skip: false };

    const notificationType =
      isRecord(notification.metadata) && typeof notification.metadata.notificationType === "string"
        ? notification.metadata.notificationType
        : null;
    const minutesSinceNotification = Math.round((now.getTime() - notification.createdAt.getTime()) / 60_000);

    try {
      await prisma.auditLog.create({
        data: {
          action: ACK_SILENCED_ACTION,
          targetType: CONTACT_TARGET_TYPE,
          targetId,
          tenantId: connection.tenantId,
          metadata: {
            connectionId,
            contactPhoneMasked: maskContactPhone(canonicalContactDigits(fromPhone)),
            kind: classification.kind,
            notificationType,
            notificationAuditId: notification.id,
            minutesSinceNotification,
          },
        },
      });
    } catch (err) {
      await logBotEvent("error", "ack_reply_silence_audit_failed", { connectionId, error: serializeError(err) });
    }
    await logBotEvent("info", "ack_reply_silenced", {
      connectionId,
      contactPhoneMasked: maskContactPhone(canonicalContactDigits(fromPhone)),
      kind: classification.kind,
      notificationType,
      minutesSinceNotification,
    });
    return { skip: true };
  } catch (err) {
    await logBotEvent("error", "ack_reply_intercept_failed", { connectionId, error: serializeError(err) });
    return { skip: false };
  }
}
