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
  createAdvertisementDelivery,
  listDueAdvertisementDeletions,
  listTriggeredAdvertisements,
  loadRecipientAdDeliveries,
  markAdvertisementDeliveryDeleted,
  markAdvertisementDeliveryDeleteFailed,
  markAdvertisementSent,
  type AdvertisementDeliveryInput,
} from "@/repositories/advertisement.repository";
import {
  ADVERTISEMENT_DELAY_MS,
  WHATSAPP_DELETE_WINDOW_HOURS,
  computeDeleteAt,
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
}

export type AdvertisementDispatchOutcome =
  | { status: "sent"; advertisementId: string; messageIds: string[] }
  | { status: "failed"; advertisementId: string; error: string }
  | {
      status: "skipped";
      reason:
        | "tabela_ausente"
        | "nenhuma_ativa"
        | "limite_frequencia"
        | "contato_pausado"
        | "contato_bloqueado"
        | "telefone_invalido"
        | "conexao_indisponivel";
    }
  | { status: "error"; error: string };

/** Dependências trocáveis nos testes (scripts/check-advertisements.ts). */
export interface AdvertisementDispatchDeps {
  now: () => Date;
  loadCandidates: (connectionId: string, notificationType: string) => Promise<AdvertisementRuleInput[]>;
  isContactPaused: (connectionId: string, phones: string[]) => Promise<boolean>;
  isContactOptedOut: (connectionId: string, phones: string[]) => Promise<boolean>;
  loadHistory: (trigger: AdvertisementTrigger, contactKey: string, now: Date) => Promise<RecipientAdHistory>;
  getSender: (connectionId: string, providerKey: string) => Promise<{ provider: WhatsappProvider; config: WhatsappConnectionConfig } | null>;
  recordDelivery: (data: AdvertisementDeliveryInput) => Promise<unknown>;
  markSent: (id: string, at: Date) => Promise<unknown>;
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

export const defaultAdvertisementDispatchDeps: AdvertisementDispatchDeps = {
  now: () => new Date(),
  loadCandidates: (connectionId, notificationType) => listTriggeredAdvertisements(connectionId, notificationType),
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
  recordDelivery: createAdvertisementDelivery,
  markSent: markAdvertisementSent,
};

/**
 * Depois de um envio de função COM SUCESSO: escolhe e envia no máximo UMA
 * publicidade para aquele destinatário. Nunca lança — todo erro vira um
 * resultado e um log; o recibo já foi entregue antes disto rodar.
 */
export async function dispatchAdvertisementAfterNotification(
  trigger: AdvertisementTrigger,
  deps: AdvertisementDispatchDeps = defaultAdvertisementDispatchDeps
): Promise<AdvertisementDispatchOutcome> {
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

    const contactKey = contactTargetKey(trigger.connectionId, trigger.to);
    if (!contactKey) return { status: "skipped", reason: "telefone_invalido" };

    const phones = phoneVariants(trigger.to);
    if (await deps.isContactPaused(trigger.connectionId, phones)) return { status: "skipped", reason: "contato_pausado" };
    if (await deps.isContactOptedOut(trigger.connectionId, phones)) return { status: "skipped", reason: "contato_bloqueado" };

    const history = await deps.loadHistory(trigger, contactKey, now);
    const selection = selectAdvertisement(candidates, { notificationType: trigger.notificationType, now, history });
    if (!selection.ad) return { status: "skipped", reason: selection.reason };
    const ad = selection.ad;

    const sender = await deps.getSender(trigger.connectionId, trigger.providerKey);
    if (!sender) return { status: "skipped", reason: "conexao_indisponivel" };

    const plan = planAdvertisementMessage(ad);
    const result = await sendMessagePlan(sender.provider, sender.config, trigger.to, plan.deliveries, 0);
    const sentAt = deps.now();
    const fullySent = result.ok && result.sentCount === plan.deliveries.length;
    const messageIds = messageIdsFromPlanResult(result);
    const deleteAt = result.sentCount > 0 ? computeDeleteAt(sentAt, ad.deleteAfterHours) : null;

    await deps.recordDelivery({
      advertisementId: ad.id,
      connectionId: trigger.connectionId,
      contactKey,
      recipientPhone: deleteAt && messageIds.length > 0 ? trigger.to : null,
      notificationType: trigger.notificationType,
      status: result.sentCount > 0 ? "SENT" : "FAILED",
      messageIds,
      error: fullySent ? null : result.message.slice(0, 500),
      deleteAt: messageIds.length > 0 ? deleteAt : null,
    });
    if (result.sentCount > 0) await deps.markSent(ad.id, sentAt);

    if (result.sentCount === 0) return { status: "failed", advertisementId: ad.id, error: result.message };
    return { status: "sent", advertisementId: ad.id, messageIds };
  } catch (err) {
    await logBotEvent("error", "advertisement.dispatch_failed", {
      connectionId: trigger.connectionId,
      notificationType: trigger.notificationType,
      error: serializeError(err),
    }).catch(() => undefined);
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Agenda o disparo para depois da resposta da API e espera alguns segundos
 * para a publicidade chegar depois do recibo. Nunca lança e nunca segura a
 * resposta. `schedule` é o after() do Next (ver advertisement-schedule.ts);
 * fica injetável para os testes rodarem fora do Next.
 */
export function scheduleAdvertisementTask(
  trigger: AdvertisementTrigger,
  schedule: (task: () => Promise<void>) => void,
  options: { delayMs?: number; deps?: AdvertisementDispatchDeps } = {}
): void {
  const delayMs = options.delayMs ?? ADVERTISEMENT_DELAY_MS;
  try {
    schedule(async () => {
      try {
        await sleep(delayMs);
        const outcome = await dispatchAdvertisementAfterNotification(trigger, options.deps);
        if (outcome.status !== "skipped" || outcome.reason !== "nenhuma_ativa") {
          await logBotEvent(outcome.status === "sent" || outcome.status === "skipped" ? "info" : "warn", "advertisement.dispatch", {
            connectionId: trigger.connectionId,
            notificationType: trigger.notificationType,
            ...outcome,
          });
        }
      } catch {
        // dispatch já não lança; isto é só defesa extra.
      }
    });
  } catch (err) {
    void logBotEvent("error", "advertisement.schedule_failed", {
      connectionId: trigger.connectionId,
      error: serializeError(err),
    }).catch(() => undefined);
  }
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
