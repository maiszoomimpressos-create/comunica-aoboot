import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { isWithinSendWindow } from "@/lib/campaigns/schedule";
import {
  resetDailyCounterIfNewDay,
  incrementDailySentCount,
} from "@/repositories/connection-campaign-settings.repository";
import {
  listRunningCampaignsForDispatch,
  recoverStuckRecipients,
  claimDueRecipients,
  markRecipientSent,
  markRecipientFailed,
  markRecipientOptedOut,
  releaseRecipientsToPending,
  lastAttemptedStatuses,
  countUnfinishedRecipients,
  pauseCampaignAuto,
  completeCampaign,
  type ClaimedRecipient,
} from "@/repositories/campaign.repository";

/** Safety cap on how many recipients a single campaign can claim per tick —
 * normal pacing (12-18s between messages, ticked every ~1min by the external
 * pinger) means only a handful are ever actually due, but this bounds a
 * worst case (e.g. after downtime, a big backlog all becoming due at once). */
const CLAIM_LIMIT_PER_TICK = 20;

/** Recipients stuck PROCESSING longer than this are assumed orphaned by a
 * crashed/interrupted tick and are recovered back to PENDING. */
const STUCK_RECIPIENT_THRESHOLD_MS = 10 * 60 * 1000;

export interface DispatchSummary {
  campaignsRunning: number;
  campaignsProcessed: number;
  sent: number;
  failed: number;
  optedOut: number;
  autoPaused: string[];
  completed: string[];
}

/**
 * The dispatcher tick — called by /api/cron/campaign-dispatcher on every hit
 * from the external pinger (see schedule.ts / campaign-dispatcher module
 * plan). Stateless and idempotent: everything it needs to decide "what's due
 * right now" lives in the DB (CampaignRecipient.scheduledAt, set up front by
 * campaign.service.ts's startCampaign via computeSchedule), so calling this
 * twice in a row or missing a tick entirely is always safe — it just
 * processes whatever's due at call time.
 */
export async function dispatchDueCampaigns(): Promise<DispatchSummary> {
  const now = new Date();
  await recoverStuckRecipients(new Date(now.getTime() - STUCK_RECIPIENT_THRESHOLD_MS));

  const campaigns = await listRunningCampaignsForDispatch();
  const summary: DispatchSummary = {
    campaignsRunning: campaigns.length,
    campaignsProcessed: 0,
    sent: 0,
    failed: 0,
    optedOut: 0,
    autoPaused: [],
    completed: [],
  };

  for (const campaign of campaigns) {
    const settings = campaign.connection.campaignSettings;
    // Every campaign is created only after getOrCreateConnectionCampaignSettings
    // ran (see campaign.service.ts's createCampaign) — this should never be
    // null in practice, but skip defensively rather than throw and abort
    // every other campaign's tick.
    if (!settings || !campaign.connection.apiUrl || !campaign.connection.apiTokenCipher) continue;

    if (!isWithinSendWindow(now, settings)) continue;

    const freshSettings = (await resetDailyCounterIfNewDay(campaign.connectionId, now)) ?? settings;
    const remainingToday =
      freshSettings.dailyLimit === null
        ? CLAIM_LIMIT_PER_TICK
        : Math.max(0, freshSettings.dailyLimit - freshSettings.dailySentCount);
    if (remainingToday <= 0) continue;

    const claimLimit = Math.min(CLAIM_LIMIT_PER_TICK, remainingToday);
    const claimed = await claimDueRecipients(campaign.id, now, claimLimit);
    if (claimed.length === 0) continue;

    summary.campaignsProcessed++;

    const apiToken = decryptSecret(campaign.connection.apiTokenCipher);
    const provider = getWhatsappProvider(campaign.connection.provider.key);
    const providerConfig = {
      apiUrl: campaign.connection.apiUrl,
      apiToken,
      phoneNumber: campaign.connection.phoneNumber,
    };

    let autoPaused = false;
    const unprocessed: string[] = [];

    for (let i = 0; i < claimed.length; i++) {
      if (autoPaused) {
        unprocessed.push(claimed[i].id);
        continue;
      }
      const recipient = claimed[i];
      await processRecipient(recipient, campaign, providerConfig, provider, now, summary);

      const consecutive = await lastAttemptedStatuses(campaign.id, freshSettings.maxConsecutiveErrors);
      const allFailed = consecutive.length === freshSettings.maxConsecutiveErrors && consecutive.every((s) => s === "FAILED");
      if (allFailed) {
        await pauseCampaignAuto(
          campaign.id,
          `Pausada automaticamente após ${freshSettings.maxConsecutiveErrors} falhas de envio consecutivas.`
        );
        summary.autoPaused.push(campaign.id);
        autoPaused = true;
      }
    }

    if (unprocessed.length > 0) await releaseRecipientsToPending(unprocessed);

    if (!autoPaused) {
      const unfinished = await countUnfinishedRecipients(campaign.id);
      if (unfinished === 0) {
        await completeCampaign(campaign.id, now);
        summary.completed.push(campaign.id);
      }
    }
  }

  return summary;
}

async function processRecipient(
  recipient: ClaimedRecipient,
  campaign: { connectionId: string; messageText: string; mediaType: string | null; mediaUrl: string | null },
  providerConfig: { apiUrl: string; apiToken: string; phoneNumber: string },
  provider: ReturnType<typeof getWhatsappProvider>,
  now: Date,
  summary: DispatchSummary
): Promise<void> {
  if (recipient.optedOut) {
    await markRecipientOptedOut(recipient.id);
    summary.optedOut++;
    return;
  }

  const result = await (campaign.mediaType === "image"
    ? provider.sendImage(providerConfig, recipient.phone, campaign.mediaUrl!, campaign.messageText)
    : campaign.mediaType === "video"
      ? provider.sendVideo(providerConfig, recipient.phone, campaign.mediaUrl!, campaign.messageText)
      : provider.sendMessage(providerConfig, recipient.phone, campaign.messageText));

  if (result.ok) {
    await markRecipientSent(recipient.id, now);
    await incrementDailySentCount(campaign.connectionId);
    summary.sent++;
  } else {
    await markRecipientFailed(recipient.id, now, result.message);
    summary.failed++;
  }
}
