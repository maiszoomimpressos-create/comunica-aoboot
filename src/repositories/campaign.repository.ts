import { prisma } from "@/lib/db/prisma";
import type { CampaignStatus, CampaignRecipientStatus } from "@/generated/prisma/client";
import type { ConnectionCampaignSettingsRow } from "@/repositories/connection-campaign-settings.repository";

// --- Criação -----------------------------------------------------------------

export interface CampaignOverridesInput {
  batchSize: number | null;
  minMessageIntervalSeconds: number | null;
  maxMessageIntervalSeconds: number | null;
  minBatchPauseSeconds: number | null;
  maxBatchPauseSeconds: number | null;
}

export interface CreateCampaignInput {
  tenantId: string;
  connectionId: string;
  listId: string;
  name: string;
  messageText: string;
  mediaType: string | null;
  mediaUrl: string | null;
  /** Snapshot of the list's active contacts at creation time — see
   * campaign.service.ts's createCampaign for why this is resolved by the
   * caller, not by this function. */
  contactIds: string[];
  overrides: CampaignOverridesInput;
}

export function createCampaignWithRecipients(input: CreateCampaignInput) {
  return prisma.campaign.create({
    data: {
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      listId: input.listId,
      name: input.name,
      messageText: input.messageText,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      batchSize: input.overrides.batchSize,
      minMessageIntervalSeconds: input.overrides.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: input.overrides.maxMessageIntervalSeconds,
      minBatchPauseSeconds: input.overrides.minBatchPauseSeconds,
      maxBatchPauseSeconds: input.overrides.maxBatchPauseSeconds,
      recipients: { createMany: { data: input.contactIds.map((contactId) => ({ contactId })) } },
    },
  });
}

// --- Leitura (tenant-scoped) -------------------------------------------------

export function getCampaignSummary(tenantId: string, campaignId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
}

export interface CampaignListRow {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  pausedReason: string | null;
  listName: string;
  counts: Partial<Record<CampaignRecipientStatus, number>>;
  total: number;
}

/** One query per connection, not per campaign — fine at this module's scale
 * (a handful of campaigns per connection, hundreds/low-thousands of
 * recipients each), same trade-off already made by upsertSyncedContacts. */
export async function listCampaignsForConnection(tenantId: string, connectionId: string): Promise<CampaignListRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    include: {
      list: { select: { name: true } },
      recipients: { select: { status: true } },
    },
  });
  return campaigns.map((c) => {
    const counts: Partial<Record<CampaignRecipientStatus, number>> = {};
    for (const r of c.recipients) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      pausedReason: c.pausedReason,
      listName: c.list.name,
      counts,
      total: c.recipients.length,
    };
  });
}

export interface CampaignRecipientRow {
  id: string;
  status: CampaignRecipientStatus;
  attempts: number;
  errorMessage: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  contactId: string;
  phone: string;
  name: string | null;
}

export interface CampaignDetail {
  id: string;
  name: string;
  messageText: string;
  mediaType: string | null;
  mediaUrl: string | null;
  status: CampaignStatus;
  consentConfirmed: boolean;
  pausedReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  connectionId: string;
  connectionName: string;
  listId: string;
  listName: string;
  recipients: CampaignRecipientRow[];
}

export async function getCampaignDetail(tenantId: string, campaignId: string): Promise<CampaignDetail | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: {
      list: { select: { id: true, name: true } },
      connection: { select: { id: true, connectionName: true } },
      recipients: {
        orderBy: { id: "asc" },
        include: { contact: { select: { phone: true, name: true } } },
      },
    },
  });
  if (!campaign) return null;

  return {
    id: campaign.id,
    name: campaign.name,
    messageText: campaign.messageText,
    mediaType: campaign.mediaType,
    mediaUrl: campaign.mediaUrl,
    status: campaign.status,
    consentConfirmed: campaign.consentConfirmed,
    pausedReason: campaign.pausedReason,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    finishedAt: campaign.finishedAt,
    connectionId: campaign.connectionId,
    connectionName: campaign.connection.connectionName,
    listId: campaign.listId,
    listName: campaign.list.name,
    recipients: campaign.recipients.map((r) => ({
      id: r.id,
      status: r.status,
      attempts: r.attempts,
      errorMessage: r.errorMessage,
      scheduledAt: r.scheduledAt,
      sentAt: r.sentAt,
      failedAt: r.failedAt,
      contactId: r.contactId,
      phone: r.contact.phone,
      name: r.contact.name,
    })),
  };
}

/** A campaign already RUNNING or PAUSED on this connection — the guard
 * behind "one active campaign per connection at a time" (the connection's
 * pacing settings can't be shared/contended between two campaigns). */
export function findActiveCampaignForConnection(tenantId: string, connectionId: string) {
  return prisma.campaign.findFirst({
    where: { tenantId, connectionId, status: { in: ["RUNNING", "PAUSED"] } },
  });
}

// --- Transições de status (tenant-scoped) -------------------------------------

export function markCampaignRunning(
  tenantId: string,
  campaignId: string,
  startedAt: Date | null,
  consentConfirmed: boolean
) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, tenantId },
    data: {
      status: "RUNNING",
      pausedReason: null,
      consentConfirmed,
      ...(startedAt ? { startedAt } : {}),
    },
  });
}

export function markCampaignPaused(tenantId: string, campaignId: string, reason: string) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, tenantId },
    data: { status: "PAUSED", pausedReason: reason },
  });
}

export async function markCampaignCancelled(tenantId: string, campaignId: string, now: Date) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { id: true } });
  if (!campaign) return { count: 0 };
  await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaign.id }, data: { status: "CANCELLED", finishedAt: now } }),
    prisma.campaignRecipient.updateMany({
      where: { campaignId: campaign.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "CANCELLED" },
    }),
  ]);
  return { count: 1 };
}

// --- Agendamento (chamado por campaign.service.ts ao iniciar/retomar) --------

export async function getPendingRecipientIds(campaignId: string): Promise<string[]> {
  const rows = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** `ids[i]` gets `scheduledAt[i]` — caller (campaign.service.ts) guarantees
 * same length/order (both come from computeSchedule fed by getPendingRecipientIds). */
export function scheduleRecipients(ids: string[], scheduledAt: Date[]) {
  return prisma.$transaction(
    ids.map((id, i) => prisma.campaignRecipient.update({ where: { id }, data: { scheduledAt: scheduledAt[i] } }))
  );
}

// --- Dispatcher (sem sessão de tenant) ---------------------------------------

export interface RunningCampaignForDispatch {
  id: string;
  tenantId: string;
  connectionId: string;
  messageText: string;
  mediaType: string | null;
  mediaUrl: string | null;
  overrides: CampaignOverridesInput;
  connection: {
    id: string;
    status: string;
    apiUrl: string | null;
    apiTokenCipher: string | null;
    phoneNumber: string;
    provider: { key: string };
    campaignSettings: ConnectionCampaignSettingsRow | null;
  };
}

/** Every RUNNING campaign whose connection is still CONNECTED — the
 * dispatcher's outer loop. Not tenant-scoped: this runs from the cron route,
 * outside any tenant session, same pattern as getConnectionForWebhook. */
export async function listRunningCampaignsForDispatch(): Promise<RunningCampaignForDispatch[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "RUNNING", connection: { status: "CONNECTED" } },
    include: { connection: { include: { provider: true, campaignSettings: true } } },
  });
  return campaigns.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    connectionId: c.connectionId,
    messageText: c.messageText,
    mediaType: c.mediaType,
    mediaUrl: c.mediaUrl,
    overrides: {
      batchSize: c.batchSize,
      minMessageIntervalSeconds: c.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: c.maxMessageIntervalSeconds,
      minBatchPauseSeconds: c.minBatchPauseSeconds,
      maxBatchPauseSeconds: c.maxBatchPauseSeconds,
    },
    connection: c.connection,
  }));
}

/** Recipients stuck PROCESSING because the server died mid-send (the process
 * that claimed them never got to mark SENT/FAILED) — reverted to PENDING so
 * the next tick can re-claim them. Global on purpose: cheap, and a stuck row
 * blocks nothing else while waiting. */
export function recoverStuckRecipients(staleBefore: Date) {
  return prisma.campaignRecipient.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: { status: "PENDING", lockedAt: null },
  });
}

export interface ClaimedRecipient {
  id: string;
  contactId: string;
  phone: string;
  optedOut: boolean;
}

/** Atomic-enough claim in two steps: find candidates, then updateMany
 * conditioned on `status: PENDING` (so a concurrent/overlapping tick can't
 * double-claim the same row), then re-fetch exactly what got claimed. A
 * single-writer cron tick doesn't strictly need this, but it's the lock
 * mechanism the schema's own comments describe (see CampaignRecipient.lockedAt). */
export async function claimDueRecipients(campaignId: string, now: Date, limit: number): Promise<ClaimedRecipient[]> {
  const due = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true },
  });
  if (due.length === 0) return [];

  const ids = due.map((d) => d.id);
  await prisma.campaignRecipient.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "PROCESSING", lockedAt: now },
  });

  const claimed = await prisma.campaignRecipient.findMany({
    where: { id: { in: ids }, status: "PROCESSING" },
    include: { contact: { select: { id: true, phone: true, optedOut: true } } },
  });
  return claimed.map((r) => ({ id: r.id, contactId: r.contact.id, phone: r.contact.phone, optedOut: r.contact.optedOut }));
}

export function markRecipientSent(id: string, now: Date) {
  return prisma.campaignRecipient.update({
    where: { id },
    data: { status: "SENT", sentAt: now, attempts: { increment: 1 } },
  });
}

export function markRecipientFailed(id: string, now: Date, errorMessage: string) {
  return prisma.campaignRecipient.update({
    where: { id },
    data: { status: "FAILED", failedAt: now, attempts: { increment: 1 }, errorMessage },
  });
}

export function markRecipientOptedOut(id: string) {
  return prisma.campaignRecipient.update({ where: { id }, data: { status: "OPTED_OUT" } });
}

export function releaseRecipientsToPending(ids: string[]) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return prisma.campaignRecipient.updateMany({
    where: { id: { in: ids }, status: "PROCESSING" },
    data: { status: "PENDING", lockedAt: null },
  });
}

/** The last `limit` recipients this campaign actually attempted (SENT or
 * FAILED), most recent attempt first — feeds the auto-pause circuit breaker
 * (see campaign-dispatcher.service.ts). Raw SQL because "most recent
 * attempt" is `COALESCE(failedAt, sentAt)`, which Prisma's orderBy can't
 * express directly. */
export async function lastAttemptedStatuses(campaignId: string, limit: number): Promise<CampaignRecipientStatus[]> {
  const rows = await prisma.$queryRaw<{ status: CampaignRecipientStatus }[]>`
    SELECT status FROM campaign_recipient
    WHERE "campaignId" = ${campaignId} AND status IN ('SENT', 'FAILED')
    ORDER BY COALESCE("failedAt", "sentAt") DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.status);
}

export function countUnfinishedRecipients(campaignId: string) {
  return prisma.campaignRecipient.count({ where: { campaignId, status: { in: ["PENDING", "PROCESSING"] } } });
}

export function pauseCampaignAuto(campaignId: string, reason: string) {
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED", pausedReason: reason } });
}

export function completeCampaign(campaignId: string, now: Date) {
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED", finishedAt: now } });
}
