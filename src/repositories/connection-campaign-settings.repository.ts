import { prisma } from "@/lib/db/prisma";
import { CAMPAIGN_DEFAULTS } from "@/config/whatsapp-campaign-defaults";
import { startOfLocalDay } from "@/lib/campaigns/schedule";

export interface ConnectionCampaignSettingsRow {
  id: string;
  sendWindowStart: string;
  sendWindowEnd: string;
  batchSize: number;
  minMessageIntervalSeconds: number;
  maxMessageIntervalSeconds: number;
  minBatchPauseSeconds: number;
  maxBatchPauseSeconds: number;
  dailyLimit: number | null;
  dailySentCount: number;
  dailySentDate: Date | null;
  maxConsecutiveErrors: number;
  campaignsEnabled: boolean;
  warmupEnabled: boolean;
  warmupStartedAt: Date | null;
  verifyNumbersBeforeSend: boolean;
  optOutFooterEnabled: boolean;
  optOutFooterText: string | null;
  maxAttempts: number;
  coldDailyLimit: number;
  coldDailySentCount: number;
  coldMinMessageIntervalSeconds: number;
  coldMaxMessageIntervalSeconds: number;
  lastSentAt: Date | null;
  dispatchLockToken: string | null;
  dispatchLockedUntil: Date | null;
  connectionId: string;
}

/** Get-or-create: seeds the row from CAMPAIGN_DEFAULTS the first time a
 * connection's campaign settings are read — see the comment on
 * ConnectionCampaignSettings in schema.prisma. Never re-seeds afterward;
 * from here on the tenant edits freely via updateConnectionCampaignSettings. */
export function getOrCreateConnectionCampaignSettings(connectionId: string): Promise<ConnectionCampaignSettingsRow> {
  return prisma.connectionCampaignSettings.upsert({
    where: { connectionId },
    create: {
      connectionId,
      sendWindowStart: CAMPAIGN_DEFAULTS.sendWindowStart,
      sendWindowEnd: CAMPAIGN_DEFAULTS.sendWindowEnd,
      batchSize: CAMPAIGN_DEFAULTS.batchSize,
      minMessageIntervalSeconds: CAMPAIGN_DEFAULTS.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: CAMPAIGN_DEFAULTS.maxMessageIntervalSeconds,
      minBatchPauseSeconds: CAMPAIGN_DEFAULTS.minBatchPauseSeconds,
      maxBatchPauseSeconds: CAMPAIGN_DEFAULTS.maxBatchPauseSeconds,
      dailyLimit: CAMPAIGN_DEFAULTS.dailyLimit,
      maxConsecutiveErrors: CAMPAIGN_DEFAULTS.maxConsecutiveErrors,
      warmupEnabled: CAMPAIGN_DEFAULTS.warmupEnabled,
      verifyNumbersBeforeSend: CAMPAIGN_DEFAULTS.verifyNumbersBeforeSend,
      optOutFooterEnabled: CAMPAIGN_DEFAULTS.optOutFooterEnabled,
      maxAttempts: CAMPAIGN_DEFAULTS.maxAttempts,
    },
    update: {},
  });
}

export interface UpdateConnectionCampaignSettingsInput {
  sendWindowStart: string;
  sendWindowEnd: string;
  batchSize: number;
  minMessageIntervalSeconds: number;
  maxMessageIntervalSeconds: number;
  minBatchPauseSeconds: number;
  maxBatchPauseSeconds: number;
  dailyLimit: number | null;
  maxConsecutiveErrors: number;
  campaignsEnabled: boolean;
  warmupEnabled: boolean;
  verifyNumbersBeforeSend: boolean;
  optOutFooterEnabled: boolean;
  optOutFooterText: string | null;
  maxAttempts: number;
  coldDailyLimit: number;
  coldMinMessageIntervalSeconds: number;
  coldMaxMessageIntervalSeconds: number;
}

export function updateConnectionCampaignSettings(connectionId: string, data: UpdateConnectionCampaignSettingsInput) {
  return prisma.connectionCampaignSettings.updateMany({ where: { connectionId }, data });
}

// --- Dispatcher (sem sessão de tenant) --------------------------------------

/** Resets `dailySentCount` to 0 when the stored `dailySentDate` isn't
 * "today" (SP-local calendar day) — called once per connection per tick,
 * before any send, so a tick never sends past a stale count carried over
 * from a previous day. No-op (returns the row unchanged) on the same day. */
export async function resetDailyCounterIfNewDay(
  connectionId: string,
  now: Date
): Promise<ConnectionCampaignSettingsRow | null> {
  const settings = await prisma.connectionCampaignSettings.findUnique({ where: { connectionId } });
  if (!settings) return null;
  const today = startOfLocalDay(now);
  const isNewDay = !settings.dailySentDate || settings.dailySentDate.getTime() !== today.getTime();
  if (!isNewDay) return settings;
  return prisma.connectionCampaignSettings.update({
    where: { connectionId },
    data: { dailySentCount: 0, coldDailySentCount: 0, dailySentDate: today },
  });
}

/** Conta um envio: contador do dia, último envio (ritmo entre execuções) e
 * início do aquecimento no primeiro envio do número. */
export async function recordConnectionSend(connectionId: string, sentAt: Date, startWarmup: boolean, cold = false) {
  await prisma.connectionCampaignSettings.update({
    where: { connectionId },
    data: {
      dailySentCount: { increment: 1 },
      ...(cold ? { coldDailySentCount: { increment: 1 } } : {}),
      lastSentAt: sentAt,
      ...(startWarmup ? { warmupStartedAt: sentAt } : {}),
    },
  });
}

/** Marca uma tentativa que falhou como "último envio" — falha também foi
 * uma chamada à Z-API, o próximo envio espera o intervalo do mesmo jeito. */
export function recordConnectionAttempt(connectionId: string, at: Date) {
  return prisma.connectionCampaignSettings.update({ where: { connectionId }, data: { lastSentAt: at } });
}

/** Trava por conexão: UPDATE condicional (só pega se estiver livre ou
 * vencida) — atômico no Postgres, então duas execuções do cron nunca
 * enviam pelo mesmo número ao mesmo tempo. Expira sozinha (`until`) se o
 * processo morrer sem liberar. */
export async function tryAcquireDispatchLock(connectionId: string, token: string, now: Date, until: Date) {
  const result = await prisma.connectionCampaignSettings.updateMany({
    where: {
      connectionId,
      OR: [{ dispatchLockedUntil: null }, { dispatchLockedUntil: { lt: now } }],
    },
    data: { dispatchLockToken: token, dispatchLockedUntil: until },
  });
  return result.count === 1;
}

export function releaseDispatchLock(connectionId: string, token: string) {
  return prisma.connectionCampaignSettings.updateMany({
    where: { connectionId, dispatchLockToken: token },
    data: { dispatchLockToken: null, dispatchLockedUntil: null },
  });
}
