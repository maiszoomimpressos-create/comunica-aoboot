/**
 * Interpretação do MessageStatusCallback da Z-API (puro, testável).
 * Formato documentado (developer.z-api.io, webhooks → "status da
 * mensagem"): `{ type: "MessageStatusCallback", status, ids: [messageId],
 * momment, phone, instanceId }`, com status SENT | RECEIVED | READ |
 * READ_BY_ME | PLAYED. O código também aceita `id`/`messageId` avulso e
 * status de falha (FAILED/ERROR), caso venham — **ainda não confirmado
 * contra um callback real de campanha** (os payloads crus continuam em
 * WebhookEvent pra conferir).
 */

export type DeliveryUpdate = "DELIVERED" | "READ" | "FAILED";

export interface ParsedMessageStatus {
  update: DeliveryUpdate;
  messageIds: string[];
  at: Date;
}

export const MESSAGE_STATUS_EVENT_TYPE = "MessageStatusCallback";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mapProviderStatus(status: string): DeliveryUpdate | null {
  switch (status.trim().toUpperCase()) {
    case "RECEIVED":
    case "DELIVERED":
    case "DELIVERY_ACK":
      return "DELIVERED";
    case "READ":
    case "PLAYED":
      return "READ";
    case "FAILED":
    case "ERROR":
      return "FAILED";
    default:
      // SENT (já sabemos), READ_BY_ME (o próprio dono leu), desconhecidos.
      return null;
  }
}

export function parseMessageStatusCallback(payload: unknown, now: Date = new Date()): ParsedMessageStatus | null {
  if (!isRecord(payload) || payload.type !== MESSAGE_STATUS_EVENT_TYPE) return null;
  if (typeof payload.status !== "string") return null;
  const update = mapProviderStatus(payload.status);
  if (!update) return null;

  const ids = new Set<string>();
  if (Array.isArray(payload.ids)) {
    for (const id of payload.ids) if (typeof id === "string" && id) ids.add(id);
  }
  for (const key of ["id", "messageId", "zaapId"]) {
    const value = payload[key];
    if (typeof value === "string" && value) ids.add(value);
  }
  if (ids.size === 0) return null;

  const momment = typeof payload.momment === "number" ? payload.momment : undefined;
  const at = momment && momment > 0 ? new Date(momment) : now;
  return { update, messageIds: [...ids], at };
}

/** Status de destinatário que um callback pode "subir" — nunca volta
 * atrás (um RECEIVED atrasado não desfaz um READ). */
export function statusesUpgradableTo(update: DeliveryUpdate): string[] {
  switch (update) {
    case "DELIVERED":
      return ["SENT"];
    case "READ":
      return ["SENT", "DELIVERED"];
    case "FAILED":
      return ["SENT"];
  }
}

/** messageId do corpo de resposta de um send-* da Z-API
 * (`{ zaapId, messageId, id }`). O callback de status referencia o
 * `messageId`, então ele tem prioridade. */
export function extractProviderMessageId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  for (const key of ["messageId", "id", "zaapId"]) {
    const value = raw[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
