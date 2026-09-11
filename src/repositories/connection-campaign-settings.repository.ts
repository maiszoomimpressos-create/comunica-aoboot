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
    data: { dailySentCount: 0, dailySentDate: today },
  });
}

export function incrementDailySentCount(connectionId: string) {
  return prisma.connectionCampaignSettings.update({
    where: { connectionId },
    data: { dailySentCount: { increment: 1 } },
  });
}
