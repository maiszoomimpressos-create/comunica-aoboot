import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { WhatsappProvider } from "@/lib/whatsapp/provider";
import type { WhatsappConnectionConfig } from "@/lib/whatsapp/types";
import { normalizeBrazilianMobile } from "@/lib/whatsapp/phone-format";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import { contactTargetKey, NOTIFICATION_SENT_ACTION } from "@/services/ack-silence.service";
import { findLiveAutoPauseSession } from "@/services/anti-loop.service";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import {
  claimAdvertisementDelivery,
  createAdvertisementDelivery,
  expireAdvertisementDelivery,
  failStuckAdvertisementDeliveries,
  findPendingDeliveriesByReceiptIds,
  findReceiptDeliveredAt,
  finishAdvertisementDelivery,
  getAdvertisementById,
  getAdvertisementDelivery,
  hasDeliveryForReceipt,
  listDueAdvertisementDeletions,
  listPendingAdvertisementDeliveries,
  listTriggeredAdvertisements,
  loadRecipientAdDeliveries,
  markAdvertisementDeliveryDeleted,
  markAdvertisementDeliveryDeleteFailed,
  markAdvertisementSent,
  type AdvertisementDeliveryInput,
  type PendingAdvertisementDelivery,
} from "@/repositories/advertisement.repository";
import {
  ADVERTISEMENT_DELAY_MS,
  ADVERTISEMENT_RECEIPT_TIMEOUT_MS,
  ADVERTISEMENT_SENDING_STUCK_MS,
  RECEIPT_DELIVERED_STATUSES,
  WHATSAPP_DELETE_WINDOW_HOURS,
  computeDeleteAt,
  isAdvertisementLive,
  isMissingTableError,
  planAdvertisementMessage,
  selectAdvertisement,
  type AdvertisementRuleInput,
  type RecipientAdHistory,
} from "@/lib/advertisements/advertisement-rules";
import { messageIdsFromPlanResult, sendMessagePlan } from "@/lib/whatsapp/send-message-plan";

export interface AdvertisementTrigger {
  connectionId: string;
  tenantId: string;
  providerKey: string;
  to: string;
  notificationType: string;
  /** messageId do recibo na Z-API — a publicidade espera o RECEIVED dele. */
  receiptMessageId: string | null;
}

export type AdvertisementSkipReason =
  | "tabela_ausente"
  | "nenhuma_ativa"
  | "limite_frequencia"
  | "contato_pausado"
  | "contato_bloqueado"
  | "telefone_invalido"
  | "conexao_indisponivel"
  | "sem_id_do_recibo"
  | "ja_na_fila";

/** Resultado de enfileirar (no envio do recibo). */
export type AdvertisementEnqueueOutcome =
  | { status: "queued"; advertisementId: string; deliveryId: string }
  | { status: "skipped"; reason: AdvertisementSkipReason }
  | { status: "error"; error: string };

/** Resultado de tentar enviar uma publicidade da fila. */
export type AdvertisementDispatchOutcome =
  | { status: "sent"; advertisementId: string; messageIds: string[] }
  | { status: "failed"; advertisementId: string; error: string }
  | { status: "waiting"; reason: "recibo_nao_entregue" | "aguardando_intervalo"; readyAt?: Date }
  | { status: "expired" }
  | { status: "skipped"; reason: AdvertisementSkipReason | "ja_processada" | "publicidade_inativa" }
  | { status: "error"; error: string };

/** Dependências trocáveis nos testes (scripts/check-advertisements.ts). */
export interface AdvertisementDispatchDeps {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  loadCandidates: (connectionId: string, notificationType: string) => Promise<AdvertisementRuleInput[]>;
  loadAdvertisement: (id: string) => Promise<AdvertisementRuleInput | null>;
  isContactPaused: (connectionId: string, phones: string[]) => Promise<boolean>;
  isContactOptedOut: (connectionId: string, phones: string[]) => Promise<boolean>;
  loadHistory: (trigger: AdvertisementTrigger, contactKey: string, now: Date) => Promise<RecipientAdHistory>;
  getSender: (connectionId: string, providerKey: string) => Promise<{ provider: WhatsappProvider; config: WhatsappConnectionConfig } | null>;
  hasDeliveryForReceipt: (connectionId: string, receiptMessageId: string, since: Date) => Promise<boolean>;
  createPending: (data: AdvertisementDeliveryInput) => Promise<{ id: string }>;
  getDelivery: (id: string) => Promise<PendingAdvertisementDelivery | null>;
  findReceiptDeliveredAt: (connectionId: string, receiptMessageId: string, since: Date) => Promise<Date | null>;
  claim: (id: string) => Promise<boolean>;
  expire: (id: string, error: string) => Promise<boolean>;
  finish: (
    id: string,
    data: { status: "SENT" | "FAILED" | "SKIPPED"; messageIds: string[]; recipientPhone: string | null; error: string | null; deleteAt: Date | null }
  ) => Promise<unknown>;
  markSent: (id: string, at: Date) => Promise<unknown>;
  listPending: (limit: number) => Promise<{ id: string }[]>;
  failStuck: (createdBefore: Date) => Promise<unknown>;
}

/** Formatos possíveis do mesmo celular (com e sem o 9º dígito). */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const withNinth = normalizeBrazilianMobile(digits);
  const variants = new Set([phone, digits, withNinth]);
  if (withNinth.length === 13 && withNinth.startsWith("55") && withNinth[4] === "9") {
    variants.add(`${withNinth.slice(0, 4)}${withNinth.slice(5)}`);
  }
  return [...variants].filter(Boolean);
}

const DAY_MS = 24 * 3_600_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const defaultAdvertisementDispatchDeps: AdvertisementDispatchDeps = {
  now: () => new Date(),
  sleep,
  loadCandidates: (connectionId, notificationType) => listTriggeredAdvertisements(connectionId, notificationType),
  loadAdvertisement: (id) => getAdvertisementById(id),
  async isContactPaused(connectionId, phones) {
    for (const phone of phones) {
      if (await findLiveAutoPauseSession(connectionId, phone)) return true;
    }
    return false;
  },
  async isContactOptedOut(connectionId, phones) {
    const row = await prisma.contact.findFirst({
      where: { connectionId, phone: { in: phones }, optedOut: true },
      select: { id: true },
    });
    return !!row;
  },
  async loadHistory(trigger, contactKey, now) {
    const { lastSentAt, last24hCount } = await loadRecipientAdDeliveries(
      trigger.connectionId,
      contactKey,
      new Date(now.getTime() - DAY_MS)
    );
    const since = lastSentAt ?? new Date(now.getTime() - 90 * DAY_MS);
    const sendsSinceLastAd = await prisma.auditLog.count({
      where: {
        action: NOTIFICATION_SENT_ACTION,
        tenantId: trigger.tenantId,
        targetId: contactKey,
        createdAt: { gt: since },
      },
    });
    return { adsLast24h: last24hCount, sendsSinceLastAd };
  },
  async getSender(connectionId, providerKey) {
    const credentials = await getConnectionCredentialsById(connectionId);
    if (!credentials?.apiUrl || !credentials.apiTokenCipher) return null;
    return {
      provider: getWhatsappProvider(credentials.provider.key || providerKey),
      config: {
        apiUrl: credentials.apiUrl,
        apiToken: decryptSecret(credentials.apiTokenCipher),
        phoneNumber: credentials.phoneNumber,
      },
    };
  },
  hasDeliveryForReceipt,
  createPending: createAdvertisementDelivery,
  getDelivery: getAdvertisementDelivery,
  findReceiptDeliveredAt: (connectionId, receiptMessageId, since) =>
    findReceiptDeliveredAt(connectionId, receiptMessageId, since, RECEIPT_DELIVERED_STATUSES),
  claim: claimAdvertisementDelivery,
  expire: expireAdvertisementDelivery,
  finish: finishAdvertisementDelivery,
  markSent: markAdvertisementSent,
  listPending: listPendingAdvertisementDeliveries,
  failStuck: failStuckAdvertisementDeliveries,
};

/**
 * Passo 1 — logo depois de um recibo enviado COM SUCESSO: escolhe no máximo
 * UMA publicidade e deixa na fila (PENDING) esperando o recibo chegar no
 * aparelho. Não envia nada aqui. Nunca lança.
 */
export async function enqueueAdvertisementAfterNotification(
  trigger: AdvertisementTrigger,
  deps: AdvertisementDispatchDeps = defaultAdvertisementDispatchDeps
): Promise<AdvertisementEnqueueOutcome> {
  try {
    const now = deps.now();
    let candidates: AdvertisementRuleInput[];
    try {
      candidates = await deps.loadCandidates(trigger.connectionId, trigger.notificationType);
    } catch (err) {
      if (isMissingTableError(err)) return { status: "skipped", reason: "tabela_ausente" };
      throw err;
    }
    if (candidates.length === 0) return { status: "skipped", reason: "nenhuma_ativa" };
    if (!trigger.receiptMessageId) return { status: "skipped", reason: "sem_id_do_recibo" };

    const contactKey = contactTargetKey(trigger.connectionId, trigger.to);
    if (!contactKey) return { status: "skipped", reason: "telefone_invalido" };

    const phones = phoneVariants(trigger.to);
    if (await deps.isContactPaused(trigger.connectionId, phones)) return { status: "skipped", reason: "contato_pausado" };
    if (await deps.isContactOptedOut(trigger.connectionId, phones)) return { status: "skipped", reason: "contato_bloqueado" };

    const history = await deps.loadHistory(trigger, contactKey, now);
    const selection = selectAdvertisement(candidates, { notificationType: trigger.notificationType, now, history });
    if (!selection.ad) return { status: "skipped", reason: selection.reason };

    const since = new Date(now.getTime() - DAY_MS);
    if (await deps.hasDeliveryForReceipt(trigger.connectionId, trigger.receiptMessageId, since)) {
      return { status: "skipped", reason: "ja_na_fila" };
    }
    const row = await deps.createPending({
      advertisementId: selection.ad.id,
      connectionId: trigger.connectionId,
      contactKey,
      recipientPhone: trigger.to,
      notificationType: trigger.notificationType,
      status: "PENDING",
      messageIds: [trigger.receiptMessageId],
      error: null,
      deleteAt: null,
    });
    return { status: "queued", advertisementId: selection.ad.id, deliveryId: row.id };
  } catch (err) {
    await logBotEvent("error", "advertisement.enqueue_failed", {
      connectionId: trigger.connectionId,
      notificationType: trigger.notificationType,
      error: serializeError(err),
    }).catch(() => undefined);
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Passo 2 — envia a publicidade de uma linha PENDING quando o recibo já
 * chegou no aparelho (RECEIVED) há pelo menos 30 s. Chamado pelo after()
 * do webhook de status (com `wait`: dorme o que faltar) e pelo cron de ~1
 * min (sem esperar). Sem RECEIVED em 30 min: expira e não envia. Só quem
 * reservar a linha (PENDING→SENDING) envia — uma só por recibo. Nunca lança.
 */
export async function processPendingAdvertisement(
  deliveryId: string,
  options: { wait?: boolean } = {},
  deps: AdvertisementDispatchDeps = defaultAdvertisementDispatchDeps
): Promise<AdvertisementDispatchOutcome> {
  try {
    const row = await deps.getDelivery(deliveryId);
    if (!row || row.status !== "PENDING") return { status: "skipped", reason: "ja_processada" };
    const receiptMessageId = row.messageIds[0];
    const now = deps.now();
    const found = receiptMessageId
      ? await deps.findReceiptDeliveredAt(row.connectionId, receiptMessageId, new Date(row.createdAt.getTime() - 60_000))
      : null;
    // RECEIVED que chegou depois do prazo não vale (expira do mesmo jeito).
    const deliveredAt =
      found && found.getTime() - row.createdAt.getTime() <= ADVERTISEMENT_RECEIPT_TIMEOUT_MS ? found : null;

    if (!deliveredAt) {
      if (now.getTime() - row.createdAt.getTime() >= ADVERTISEMENT_RECEIPT_TIMEOUT_MS) {
        await deps.expire(row.id, "O recibo não confirmou entrega (RECEIVED) em 30 minutos; publicidade não enviada.");
        return { status: "expired" };
      }
      return { status: "waiting", reason: "recibo_nao_entregue" };
    }

    const readyAt = new Date(deliveredAt.getTime() + ADVERTISEMENT_DELAY_MS);
    const remaining = readyAt.getTime() - now.getTime();
    if (remaining > 0) {
      if (!options.wait) return { status: "waiting", reason: "aguardando_intervalo", readyAt };
      await deps.sleep(remaining);
    }

    if (!(await deps.claim(row.id))) return { status: "skipped", reason: "ja_processada" };

    const sendAt = deps.now();
    const ad = await deps.loadAdvertisement(row.advertisementId);
    if (!ad || !isAdvertisementLive(ad, sendAt)) {
      await deps.finish(row.id, { status: "SKIPPED", messageIds: [], recipientPhone: null, error: "Publicidade pausada ou encerrada antes do envio.", deleteAt: null });
      return { status: "skipped", reason: "publicidade_inativa" };
    }
    const to = row.recipientPhone ?? "";
    const phones = phoneVariants(to);
    if (await deps.isContactPaused(row.connectionId, phones)) {
      await deps.finish(row.id, { status: "SKIPPED", messageIds: [], recipientPhone: null, error: "Contato pausado pelo anti-loop.", deleteAt: null });
      return { status: "skipped", reason: "contato_pausado" };
    }
    if (await deps.isContactOptedOut(row.connectionId, phones)) {
      await deps.finish(row.id, { status: "SKIPPED", messageIds: [], recipientPhone: null, error: "Contato bloqueou as mensagens.", deleteAt: null });
      return { status: "skipped", reason: "contato_bloqueado" };
    }

    const sender = await deps.getSender(row.connectionId, "z-api");
    if (!sender) {
      await deps.finish(row.id, { status: "FAILED", messageIds: [], recipientPhone: null, error: "Conexão indisponível.", deleteAt: null });
      return { status: "failed", advertisementId: ad.id, error: "Conexão indisponível." };
    }

    const plan = planAdvertisementMessage(ad);
    const result = await sendMessagePlan(sender.provider, sender.config, to, plan.deliveries, 0);
    const sentAt = deps.now();
    const fullySent = result.ok && result.sentCount === plan.deliveries.length;
    const messageIds = messageIdsFromPlanResult(result);
    const deleteAt = result.sentCount > 0 && messageIds.length > 0 ? computeDeleteAt(sentAt, ad.deleteAfterHours) : null;

    await deps.finish(row.id, {
      status: result.sentCount > 0 ? "SENT" : "FAILED",
      messageIds,
      recipientPhone: deleteAt ? to : null,
      error: fullySent ? null : result.message,
      deleteAt,
    });
    if (result.sentCount > 0) await deps.markSent(ad.id, sentAt);

    if (result.sentCount === 0) return { status: "failed", advertisementId: ad.id, error: result.message };
    return { status: "sent", advertisementId: ad.id, messageIds };
  } catch (err) {
    await logBotEvent("error", "advertisement.dispatch_failed", { deliveryId, error: serializeError(err) }).catch(() => undefined);
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function logOutcome(step: string, data: Record<string, unknown> & { status: string }) {
  const level = data.status === "error" || data.status === "failed" ? "warn" : "info";
  await logBotEvent(level, step, data).catch(() => undefined);
}

/**
 * No envio do recibo: põe a publicidade na fila em segundo plano (after()).
 * Nunca lança e nunca segura a resposta. `schedule` é o after() do Next
 * (ver advertisement-schedule.service.ts), injetável nos testes.
 */
export function scheduleAdvertisementTask(
  trigger: AdvertisementTrigger,
  schedule: (task: () => Promise<void>) => void,
  options: { deps?: AdvertisementDispatchDeps } = {}
): void {
  try {
    schedule(async () => {
      try {
        const outcome = await enqueueAdvertisementAfterNotification(trigger, options.deps);
        if (outcome.status === "skipped" && outcome.reason === "nenhuma_ativa") return;
        await logOutcome("advertisement.enqueue", {
          connectionId: trigger.connectionId,
          notificationType: trigger.notificationType,
          ...outcome,
        });
        // O RECEIVED pode ter chegado antes da fila existir: confere uma vez.
        if (outcome.status === "queued") {
          const sent = await processPendingAdvertisement(outcome.deliveryId, { wait: true }, options.deps);
          if (sent.status !== "waiting") await logOutcome("advertisement.dispatch", { deliveryId: outcome.deliveryId, ...sent });
        }
      } catch {
        // as funções acima já não lançam; isto é só defesa extra.
      }
    });
  } catch (err) {
    void logBotEvent("error", "advertisement.schedule_failed", {
      connectionId: trigger.connectionId,
      error: serializeError(err),
    }).catch(() => undefined);
  }
}

/** Ids e status de um MessageStatusCallback da Z-API (ou null). */
export function parseReceiptStatusWebhook(payload: unknown): { ids: string[]; status: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.type !== "MessageStatusCallback" || typeof p.status !== "string") return null;
  if (!(RECEIPT_DELIVERED_STATUSES as readonly string[]).includes(p.status)) return null;
  const ids = Array.isArray(p.ids) ? p.ids.filter((id): id is string => typeof id === "string" && !!id) : [];
  return ids.length > 0 ? { ids, status: p.status } : null;
}

/**
 * Webhook de status: se é o RECEIVED de um recibo com publicidade na fila,
 * espera os 30 s em segundo plano e envia. Nunca lança.
 */
export function handleAdvertisementReceiptStatus(
  connectionId: string,
  payload: unknown,
  schedule: (task: () => Promise<void>) => void,
  deps: AdvertisementDispatchDeps = defaultAdvertisementDispatchDeps,
  findPending: (connectionId: string, ids: string[]) => Promise<{ id: string }[]> = findPendingDeliveriesByReceiptIds
): void {
  const parsed = parseReceiptStatusWebhook(payload);
  if (!parsed) return;
  try {
    schedule(async () => {
      try {
        const rows = await findPending(connectionId, parsed.ids);
        for (const row of rows) {
          const outcome = await processPendingAdvertisement(row.id, { wait: true }, deps);
          if (outcome.status !== "waiting") await logOutcome("advertisement.dispatch", { deliveryId: row.id, ...outcome });
        }
      } catch (err) {
        if (!isMissingTableError(err)) {
          await logBotEvent("error", "advertisement.receipt_status_failed", { connectionId, error: serializeError(err) }).catch(() => undefined);
        }
      }
    });
  } catch {
    // after() indisponível: o cron de ~1 min cuida.
  }
}

/**
 * Cron (~1 min), a garantia: envia as que já estão prontas, expira as sem
 * RECEIVED em 30 min e fecha envios interrompidos (sem reenviar).
 */
export async function processPendingAdvertisements(
  limit = 50,
  deps: AdvertisementDispatchDeps = defaultAdvertisementDispatchDeps
): Promise<{ processed: number; sent: number; expired: number; waiting: number; skipped?: "tabela_ausente" }> {
  let rows: { id: string }[];
  try {
    // A reserva (SENDING) só acontece até ~30 min depois do recibo; criada
    // há mais de 30 + 15 min e ainda SENDING = função caiu no meio.
    await deps.failStuck(
      new Date(deps.now().getTime() - ADVERTISEMENT_RECEIPT_TIMEOUT_MS - ADVERTISEMENT_SENDING_STUCK_MS)
    );
    rows = await deps.listPending(limit);
  } catch (err) {
    if (isMissingTableError(err)) return { processed: 0, sent: 0, expired: 0, waiting: 0, skipped: "tabela_ausente" };
    throw err;
  }
  let sent = 0;
  let expired = 0;
  let waiting = 0;
  for (const row of rows) {
    const outcome = await processPendingAdvertisement(row.id, { wait: false }, deps);
    if (outcome.status === "sent") sent++;
    else if (outcome.status === "expired") expired++;
    else if (outcome.status === "waiting") waiting++;
    if (outcome.status !== "waiting") await logOutcome("advertisement.dispatch", { deliveryId: row.id, via: "cron", ...outcome });
  }
  return { processed: rows.length, sent, expired, waiting };
}

/**
 * "Apagar depois de": apaga para todos as publicidades vencidas (Z-API
 * DELETE /messages). Chamado pelo cron. Sem a tabela, não faz nada.
 */
export async function deleteExpiredAdvertisementMessages(limit = 50): Promise<{
  processed: number;
  deleted: number;
  failed: number;
  skipped?: "tabela_ausente";
}> {
  const now = new Date();
  let due;
  try {
    due = await listDueAdvertisementDeletions(now, limit);
  } catch (err) {
    if (isMissingTableError(err)) return { processed: 0, deleted: 0, failed: 0, skipped: "tabela_ausente" };
    throw err;
  }
  const senders = new Map<string, Awaited<ReturnType<AdvertisementDispatchDeps["getSender"]>>>();
  let deleted = 0;
  let failed = 0;
  for (const row of due) {
    const tooLate = now.getTime() - row.createdAt.getTime() > WHATSAPP_DELETE_WINDOW_HOURS * 3_600_000;
    if (!row.recipientPhone || row.messageIds.length === 0 || tooLate) {
      await markAdvertisementDeliveryDeleteFailed(row.id, tooLate ? "Passou do prazo do WhatsApp para apagar." : "Sem dados para apagar.", true);
      failed++;
      continue;
    }
    if (!senders.has(row.connectionId)) {
      senders.set(row.connectionId, await defaultAdvertisementDispatchDeps.getSender(row.connectionId, "z-api").catch(() => null));
    }
    const sender = senders.get(row.connectionId);
    if (!sender?.provider.deleteMessage) {
      await markAdvertisementDeliveryDeleteFailed(row.id, "Conexão indisponível para apagar.", row.deleteAttempts + 1 >= 3);
      failed++;
      continue;
    }
    let error: string | null = null;
    for (const messageId of row.messageIds) {
      const res = await sender.provider.deleteMessage(sender.config, row.recipientPhone, messageId);
      if (!res.ok) error = res.message;
    }
    if (error) {
      await markAdvertisementDeliveryDeleteFailed(row.id, error, row.deleteAttempts + 1 >= 3);
      failed++;
    } else {
      await markAdvertisementDeliveryDeleted(row.id, new Date());
      deleted++;
    }
  }
  return { processed: due.length, deleted, failed };
}
