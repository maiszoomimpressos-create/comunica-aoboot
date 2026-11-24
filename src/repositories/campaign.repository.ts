import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { CampaignStatus, CampaignRecipientStatus } from "@/generated/prisma/client";
import type { ConnectionCampaignSettingsRow } from "@/repositories/connection-campaign-settings.repository";
import { partsFromCampaign, type CampaignPart } from "@/lib/campaigns/sequence";

// --- Criação -----------------------------------------------------------------

export interface CampaignOverridesInput {
  batchSize: number | null;
  minMessageIntervalSeconds: number | null;
  maxMessageIntervalSeconds: number | null;
  minBatchPauseSeconds: number | null;
  maxBatchPauseSeconds: number | null;
}

export type CampaignMediaType = "image" | "video" | "document" | "audio";

export interface CreateCampaignInput {
  tenantId: string;
  connectionId: string;
  listId: string;
  name: string;
  messageText: string;
  mediaType: CampaignMediaType | null;
  mediaUrl: string | null;
  mediaFileName: string | null;
  /** Sequência de mensagens (ver lib/campaigns/sequence.ts). */
  parts: CampaignPart[];
  minPartIntervalSeconds: number;
  maxPartIntervalSeconds: number;
  /** Lista com contato frio (Google): SAIR obrigatório + ritmo de frio. */
  coldOutreach: boolean;
  /** Snapshot of the list's active contacts at creation time — see
   * campaign.service.ts's createCampaign for why this is resolved by the
   * caller, not by this function. */
  contactIds: string[];
  overrides: CampaignOverridesInput;
}

export async function createCampaignWithRecipients(input: CreateCampaignInput) {
  // createMany em lotes — uma lista de dezenas de milhares de contatos não
  // cabe confortavelmente num único INSERT aninhado.
  const campaign = await prisma.campaign.create({
    data: {
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      listId: input.listId,
      name: input.name,
      messageText: input.messageText,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      mediaFileName: input.mediaFileName,
      parts: input.parts.map((p) => ({ type: p.type, text: p.text, mediaUrl: p.mediaUrl, fileName: p.fileName })),
      minPartIntervalSeconds: input.minPartIntervalSeconds,
      maxPartIntervalSeconds: input.maxPartIntervalSeconds,
      coldOutreach: input.coldOutreach,
      batchSize: input.overrides.batchSize,
      minMessageIntervalSeconds: input.overrides.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: input.overrides.maxMessageIntervalSeconds,
      minBatchPauseSeconds: input.overrides.minBatchPauseSeconds,
      maxBatchPauseSeconds: input.overrides.maxBatchPauseSeconds,
    },
  });
  const chunkSize = 5000;
  for (let i = 0; i < input.contactIds.length; i += chunkSize) {
    await prisma.campaignRecipient.createMany({
      data: input.contactIds.slice(i, i + chunkSize).map((contactId) => ({ campaignId: campaign.id, contactId })),
      skipDuplicates: true,
    });
  }
  return campaign;
}

// --- Leitura (tenant-scoped) -------------------------------------------------

export function getCampaignSummary(tenantId: string, campaignId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
}

export type RecipientCounts = Partial<Record<CampaignRecipientStatus, number>>;

export interface CampaignListRow {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  scheduledStartAt: Date | null;
  pausedReason: string | null;
  listName: string;
  counts: RecipientCounts;
  total: number;
}

async function countsByCampaign(campaignIds: string[]): Promise<Map<string, RecipientCounts>> {
  const result = new Map<string, RecipientCounts>();
  if (campaignIds.length === 0) return result;
  const rows = await prisma.campaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const counts = result.get(row.campaignId) ?? {};
    counts[row.status] = row._count._all;
    result.set(row.campaignId, counts);
  }
  return result;
}

function sumCounts(counts: RecipientCounts): number {
  return Object.values(counts).reduce((acc, n) => acc + (n ?? 0), 0);
}

/** Contagem por status via groupBy (não carrega os destinatários em
 * memória — campanhas de milhares de contatos continuam leves). */
export async function listCampaignsForConnection(tenantId: string, connectionId: string): Promise<CampaignListRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId, connectionId },
    orderBy: { createdAt: "desc" },
    include: { list: { select: { name: true } } },
  });
  const counts = await countsByCampaign(campaigns.map((c) => c.id));
  return campaigns.map((c) => {
    const campaignCounts = counts.get(c.id) ?? {};
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      scheduledStartAt: c.scheduledStartAt,
      pausedReason: c.pausedReason,
      listName: c.list.name,
      counts: campaignCounts,
      total: sumCounts(campaignCounts),
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
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  /** Quantas partes da sequência já saíram pra este destinatário. */
  nextPartIndex: number;
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
  mediaFileName: string | null;
  status: CampaignStatus;
  consentConfirmed: boolean;
  pausedReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  scheduledStartAt: Date | null;
  parts: CampaignPart[];
  minPartIntervalSeconds: number;
  maxPartIntervalSeconds: number;
  /** Lista com contato frio (Google): SAIR obrigatório + ritmo de frio. */
  coldOutreach: boolean;
  connectionId: string;
  connectionName: string;
  listId: string;
  listName: string;
  counts: RecipientCounts;
  total: number;
  recipients: CampaignRecipientRow[];
  /** Total de destinatários no filtro atual (pra paginação). */
  filteredTotal: number;
  page: number;
  pageSize: number;
}

export interface RecipientPageQuery {
  page: number;
  pageSize: number;
  status: CampaignRecipientStatus | null;
}

export async function getCampaignDetail(
  tenantId: string,
  campaignId: string,
  query: RecipientPageQuery
): Promise<CampaignDetail | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    include: {
      list: { select: { id: true, name: true } },
      connection: { select: { id: true, connectionName: true } },
    },
  });
  if (!campaign) return null;

  const pageSize = Math.min(200, Math.max(10, query.pageSize));
  const page = Math.max(1, query.page);
  const where = { campaignId, ...(query.status ? { status: query.status } : {}) };
  const [counts, filteredTotal, recipients] = await Promise.all([
    countsByCampaign([campaignId]),
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { phone: true, name: true } } },
    }),
  ]);
  const campaignCounts = counts.get(campaignId) ?? {};

  return {
    id: campaign.id,
    name: campaign.name,
    messageText: campaign.messageText,
    mediaType: campaign.mediaType,
    mediaUrl: campaign.mediaUrl,
    mediaFileName: campaign.mediaFileName,
    status: campaign.status,
    consentConfirmed: campaign.consentConfirmed,
    pausedReason: campaign.pausedReason,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    finishedAt: campaign.finishedAt,
    scheduledStartAt: campaign.scheduledStartAt,
    parts: partsFromCampaign(campaign),
    minPartIntervalSeconds: campaign.minPartIntervalSeconds,
    maxPartIntervalSeconds: campaign.maxPartIntervalSeconds,
    coldOutreach: campaign.coldOutreach,
    connectionId: campaign.connectionId,
    connectionName: campaign.connection.connectionName,
    listId: campaign.listId,
    listName: campaign.list.name,
    counts: campaignCounts,
    total: sumCounts(campaignCounts),
    filteredTotal,
    page,
    pageSize,
    recipients: recipients.map((r) => ({
      id: r.id,
      status: r.status,
      attempts: r.attempts,
      errorMessage: r.errorMessage,
      scheduledAt: r.scheduledAt,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      readAt: r.readAt,
      failedAt: r.failedAt,
      nextPartIndex: r.nextPartIndex,
      contactId: r.contactId,
      phone: r.contact.phone,
      name: r.contact.name,
    })),
  };
}

/** Campanha ativa (agendada, em andamento ou pausada) nesta conexão — a
 * trava de "uma campanha por conexão por vez" (o ritmo da conexão não pode
 * ser dividido entre duas campanhas). */
export function findActiveCampaignForConnection(tenantId: string, connectionId: string) {
  return prisma.campaign.findFirst({
    where: { tenantId, connectionId, status: { in: ["SCHEDULED", "RUNNING", "PAUSED"] } },
  });
}

// --- Transições de status (tenant-scoped) -------------------------------------

/** Condicional ao status atual (`from`) — duas abas clicando ao mesmo
 * tempo, ou o dispatcher mudando o status no meio, nunca se atropelam. */
export function markCampaignRunning(
  tenantId: string,
  campaignId: string,
  from: CampaignStatus[],
  startedAt: Date | null
) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, tenantId, status: { in: from } },
    data: {
      status: "RUNNING",
      pausedReason: null,
      consentConfirmed: true,
      scheduledStartAt: null,
      ...(startedAt ? { startedAt } : {}),
    },
  });
}

export function markCampaignScheduled(tenantId: string, campaignId: string, from: CampaignStatus[], startAt: Date) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, tenantId, status: { in: from } },
    data: { status: "SCHEDULED", pausedReason: null, consentConfirmed: true, scheduledStartAt: startAt },
  });
}

export function markCampaignPaused(tenantId: string, campaignId: string, reason: string) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, tenantId, status: { in: ["RUNNING", "SCHEDULED"] } },
    data: { status: "PAUSED", pausedReason: reason, scheduledStartAt: null },
  });
}

/** Cancela: campanha vira CANCELLED e só os PENDING viram CANCELLED. Um
 * destinatário PROCESSING (mensagem saindo agora) fica com o dispatcher,
 * que grava o resultado real (SENT/FAILED) — não dá pra "desmandar". */
export async function markCampaignCancelled(tenantId: string, campaignId: string, now: Date) {
  const updated = await prisma.campaign.updateMany({
    where: { id: campaignId, tenantId, status: { in: ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"] } },
    data: { status: "CANCELLED", finishedAt: now, scheduledStartAt: null },
  });
  if (updated.count === 0) return { count: 0 };
  await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return { count: 1 };
}

/** Reenvia as falhas: FAILED → PENDING (tentativas zeradas). Campanha
 * concluída volta pra PAUSED, pra passar de novo pelo "Retomar" (consentimento
 * + reagendamento). */
export async function requeueFailedRecipients(tenantId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { id: true, status: true } });
  if (!campaign) return { count: 0, campaign: null };
  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      errorMessage: null,
      failedAt: null,
      claimToken: null,
      lockedAt: null,
      scheduledAt: null,
    },
  });
  if (result.count > 0 && campaign.status === "COMPLETED") {
    await prisma.campaign.updateMany({
      where: { id: campaignId, tenantId, status: "COMPLETED" },
      data: {
        status: "PAUSED",
        finishedAt: null,
        pausedReason: `${result.count} falha(s) voltaram pra fila — clique em Retomar pra reenviar.`,
      },
    });
  }
  return { count: result.count, campaign };
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
 * same length/order. Uma única instrução por lote (UPDATE ... FROM
 * unnest) em vez de uma por destinatário. */
export async function scheduleRecipients(ids: string[], scheduledAt: Date[]) {
  const chunkSize = 2000;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunkIds = ids.slice(i, i + chunkSize);
    const chunkDates = scheduledAt.slice(i, i + chunkSize).map((d) => d.toISOString());
    await prisma.$executeRaw`
      UPDATE "campaign_recipient" AS r
      SET "scheduledAt" = v.at::timestamp
      FROM unnest(${chunkIds}::text[], ${chunkDates}::text[]) AS v(id, at)
      WHERE r."id" = v.id AND r."status" = 'PENDING'
    `;
  }
}

// --- Dispatcher (sem sessão de tenant) ---------------------------------------

export interface RunningCampaignForDispatch {
  id: string;
  tenantId: string;
  connectionId: string;
  messageText: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaFileName: string | null;
  parts: CampaignPart[];
  minPartIntervalSeconds: number;
  maxPartIntervalSeconds: number;
  /** Lista com contato frio (Google): SAIR obrigatório + ritmo de frio. */
  coldOutreach: boolean;
  overrides: CampaignOverridesInput;
  organization: { name: string; messageBusinessName: string | null; status: string };
  whatsappModuleInstalled: boolean;
  connection: {
    id: string;
    status: string;
    apiUrl: string | null;
    apiTokenCipher: string | null;
    phoneNumber: string;
    businessName: string | null;
    provider: { key: string };
    campaignSettings: ConnectionCampaignSettingsRow | null;
  };
}

/** SCHEDULED cuja hora chegou → RUNNING (condicional, idempotente). */
export function promoteDueScheduledCampaigns(now: Date) {
  return prisma.campaign.updateMany({
    where: { status: "SCHEDULED", scheduledStartAt: { lte: now } },
    data: { status: "RUNNING", scheduledStartAt: null, startedAt: now },
  });
}

/** Toda campanha RUNNING com conexão CONNECTED — o loop externo do
 * dispatcher. Não é tenant-scoped: roda da rota de cron, fora de sessão. */
export async function listRunningCampaignsForDispatch(): Promise<RunningCampaignForDispatch[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "RUNNING", connection: { status: "CONNECTED" } },
    include: {
      connection: { include: { provider: true, campaignSettings: true } },
      organization: {
        select: {
          name: true,
          messageBusinessName: true,
          status: true,
          tenantModules: { where: { module: { key: "whatsapp" } }, select: { status: true } },
        },
      },
    },
  });
  return campaigns.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    connectionId: c.connectionId,
    messageText: c.messageText,
    mediaType: c.mediaType,
    mediaUrl: c.mediaUrl,
    mediaFileName: c.mediaFileName,
    parts: partsFromCampaign(c),
    minPartIntervalSeconds: c.minPartIntervalSeconds,
    maxPartIntervalSeconds: c.maxPartIntervalSeconds,
    coldOutreach: c.coldOutreach,
    overrides: {
      batchSize: c.batchSize,
      minMessageIntervalSeconds: c.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: c.maxMessageIntervalSeconds,
      minBatchPauseSeconds: c.minBatchPauseSeconds,
      maxBatchPauseSeconds: c.maxBatchPauseSeconds,
    },
    organization: {
      name: c.organization.name,
      messageBusinessName: c.organization.messageBusinessName,
      status: c.organization.status,
    },
    whatsappModuleInstalled: c.organization.tenantModules.some((m) => m.status === "INSTALLED"),
    connection: {
      id: c.connection.id,
      status: c.connection.status,
      apiUrl: c.connection.apiUrl,
      apiTokenCipher: c.connection.apiTokenCipher,
      phoneNumber: c.connection.phoneNumber,
      businessName: c.connection.businessName,
      provider: { key: c.connection.provider.key },
      campaignSettings: c.connection.campaignSettings,
    },
  }));
}

export function getCampaignStatus(campaignId: string) {
  return prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
}

/** PROCESSING há mais que o limite = o processo caiu no meio de um envio.
 * NÃO volta pra PENDING: a mensagem pode ter saído antes da queda, e
 * reenviar duplicaria. Vira FAILED com o motivo — o tenant decide reenviar
 * pelo botão "Reenviar falhas". */
export function failStuckRecipients(staleBefore: Date, now: Date) {
  return prisma.campaignRecipient.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: {
      status: "FAILED",
      failedAt: now,
      claimToken: null,
      errorMessage: "Envio interrompido no meio (status desconhecido). Use \"Reenviar falhas\" se quiser tentar de novo.",
    },
  });
}

export function newClaimToken(): string {
  return randomUUID();
}

/** Próximo destinatário pendente (só leitura) — o dispatcher usa o
 * horário pra decidir se espera ou se encerra a execução. */
export function peekNextPendingRecipient(campaignId: string) {
  return prisma.campaignRecipient.findFirst({
    where: { campaignId, status: "PENDING", scheduledAt: { not: null } },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    select: { id: true, scheduledAt: true, nextPartIndex: true },
  });
}

export interface ClaimedRecipient {
  id: string;
  contactId: string;
  phone: string;
  name: string | null;
  optedOut: boolean;
  attempts: number;
  claimToken: string;
  /** Próxima parte da sequência a enviar (retomada). */
  nextPartIndex: number;
  partMessageIds: unknown;
  providerMessageId: string | null;
}

/** Claim atômico de UM destinatário vencido: UPDATE ... WHERE id = (SELECT
 * ... FOR UPDATE SKIP LOCKED) numa instrução só, gravando o token desta
 * execução. Duas execuções concorrentes nunca pegam a mesma linha, e quem
 * não tem o token não consegue gravar o resultado (ver mark*). */
export async function claimNextDueRecipient(
  campaignId: string,
  now: Date,
  claimToken: string
): Promise<ClaimedRecipient | null> {
  // Datas como texto ISO (UTC) + cast explícito: as colunas são
  // `timestamp` sem fuso guardando UTC (convenção do Prisma), e assim o
  // resultado não depende de como o driver serializa um Date.
  const nowUtc = now.toISOString();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "campaign_recipient"
    SET "status" = 'PROCESSING', "lockedAt" = ${nowUtc}::timestamp, "claimToken" = ${claimToken}, "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "campaign_recipient"
      WHERE "campaignId" = ${campaignId} AND "status" = 'PENDING' AND "scheduledAt" <= ${nowUtc}::timestamp
      ORDER BY "scheduledAt" ASC, "id" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `;
  if (rows.length === 0) return null;
  const claimed = await prisma.campaignRecipient.findFirst({
    where: { id: rows[0].id, claimToken, status: "PROCESSING" },
    include: { contact: { select: { id: true, phone: true, name: true, optedOut: true } } },
  });
  if (!claimed) return null;
  return {
    id: claimed.id,
    contactId: claimed.contact.id,
    phone: claimed.contact.phone,
    name: claimed.contact.name,
    optedOut: claimed.contact.optedOut,
    attempts: claimed.attempts,
    claimToken,
    nextPartIndex: claimed.nextPartIndex,
    partMessageIds: claimed.partMessageIds,
    providerMessageId: claimed.providerMessageId,
  };
}

function ownedBy(id: string, claimToken: string) {
  return { id, claimToken, status: "PROCESSING" as const };
}

/** Sequência concluída. `providerMessageId` = id da 1ª parte (é por ele
 * que o MessageStatusCallback marca entregue/lido). */
export async function markRecipientSent(id: string, claimToken: string, sentAt: Date, providerMessageId: string | null) {
  const result = await prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "SENT", sentAt, providerMessageId, errorMessage: null, lockedAt: null },
  });
  if (result.count > 0) {
    // Entregue/lido da 1ª parte que chegaram enquanto o resto da sequência
    // ainda saía (applyDeliveryUpdate só guardou as datas) — sobe o status.
    await prisma.campaignRecipient.updateMany({
      where: { id, status: "SENT", readAt: { not: null } },
      data: { status: "READ" },
    });
    await prisma.campaignRecipient.updateMany({
      where: { id, status: "SENT", deliveredAt: { not: null } },
      data: { status: "DELIVERED" },
    });
  }
  return result;
}

/** Uma parte da sequência saiu: avança nextPartIndex e guarda o messageId
 * dela ANTES de mandar a próxima — se a execução cair depois disso, a
 * retomada começa da parte seguinte (nunca reenvia esta). Renova lockedAt
 * (o detector de "travado" conta a partir do último progresso). A 1ª parte
 * já preenche providerMessageId, pro entregue/lido funcionar mesmo antes
 * de a sequência terminar. */
export function markRecipientPartSent(
  id: string,
  claimToken: string,
  partIndex: number,
  partMessageIds: (string | null)[],
  at: Date
) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: {
      nextPartIndex: partIndex + 1,
      partMessageIds,
      lockedAt: at,
      ...(partIndex === 0 ? { providerMessageId: partMessageIds[0] ?? null } : {}),
    },
  });
}

export function markRecipientFailed(id: string, claimToken: string, failedAt: Date, errorMessage: string) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "FAILED", failedAt, errorMessage, lockedAt: null },
  });
}

export function markRecipientInvalidNumber(id: string, claimToken: string, at: Date) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "INVALID_NUMBER", failedAt: at, errorMessage: "Número sem WhatsApp (phone-exists).", lockedAt: null },
  });
}

export function markRecipientOptedOut(id: string, claimToken: string) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "OPTED_OUT", lockedAt: null },
  });
}

/** Erro temporário: volta pra fila com novo horário (backoff). */
export function rescheduleRecipient(id: string, claimToken: string, at: Date, errorMessage: string) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "PENDING", scheduledAt: at, errorMessage, lockedAt: null, claimToken: null },
  });
}

/** Devolve à fila sem contar tentativa (a execução parou antes de enviar). */
export function releaseRecipient(id: string, claimToken: string) {
  return prisma.campaignRecipient.updateMany({
    where: ownedBy(id, claimToken),
    data: { status: "PENDING", lockedAt: null, claimToken: null, attempts: { decrement: 1 } },
  });
}

/** As últimas `limit` tentativas reais (SENT/entregue/lido/FAILED), mais
 * recente primeiro — sentAt/failedAt agora são o horário REAL de cada
 * envio (não o início da execução), então a ordem é confiável. */
export async function lastAttemptedStatuses(campaignId: string, limit: number): Promise<CampaignRecipientStatus[]> {
  const rows = await prisma.$queryRaw<{ status: CampaignRecipientStatus }[]>`
    SELECT status FROM campaign_recipient
    WHERE "campaignId" = ${campaignId} AND status IN ('SENT', 'DELIVERED', 'READ', 'FAILED')
    ORDER BY COALESCE("failedAt", "sentAt") DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map((r) => r.status);
}

/** Quantas tentativas a campanha já fez (pra pausa entre lotes e taxa de
 * números inválidos). */
export async function attemptStats(campaignId: string): Promise<{ attempted: number; invalid: number }> {
  const counts = await countsByCampaign([campaignId]);
  const c = counts.get(campaignId) ?? {};
  const attempted = (c.SENT ?? 0) + (c.DELIVERED ?? 0) + (c.READ ?? 0) + (c.FAILED ?? 0) + (c.INVALID_NUMBER ?? 0);
  return { attempted, invalid: c.INVALID_NUMBER ?? 0 };
}

export function countUnfinishedRecipients(campaignId: string) {
  return prisma.campaignRecipient.count({ where: { campaignId, status: { in: ["PENDING", "PROCESSING"] } } });
}

/** Pausa automática — só se ainda estiver RUNNING (nunca sobrescreve um
 * CANCELLED/PAUSED feito pelo tenant no meio da execução). */
export function pauseCampaignAuto(campaignId: string, reason: string) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, status: "RUNNING" },
    data: { status: "PAUSED", pausedReason: reason },
  });
}

/** Conclui — só se ainda estiver RUNNING. Antes era um update
 * incondicional, que transformava uma campanha cancelada no meio da
 * execução em "Concluída". */
export function completeCampaign(campaignId: string, now: Date) {
  return prisma.campaign.updateMany({
    where: { id: campaignId, status: "RUNNING" },
    data: { status: "COMPLETED", finishedAt: now },
  });
}

// --- Webhook de status (sem sessão de tenant) --------------------------------

/** Aplica entregue/lido/falha a destinatários desta conexão pelo messageId,
 * só "subindo" o status (ver statusesUpgradableTo). */
export async function applyDeliveryUpdate(
  connectionId: string,
  messageIds: string[],
  update: "DELIVERED" | "READ" | "FAILED",
  at: Date
): Promise<number> {
  const base = { providerMessageId: { in: messageIds }, campaign: { connectionId } };
  // Sequência ainda saindo (a 1ª parte já tem id, o destinatário está em
  // PROCESSING/PENDING): só guarda as datas; markRecipientSent sobe o
  // status quando a sequência termina.
  if (update !== "FAILED") {
    const inFlight = { ...base, status: { in: ["PROCESSING" as const, "PENDING" as const] } };
    await prisma.campaignRecipient.updateMany({ where: { ...inFlight, deliveredAt: null }, data: { deliveredAt: at } });
    if (update === "READ") {
      await prisma.campaignRecipient.updateMany({ where: { ...inFlight, readAt: null }, data: { readAt: at } });
    }
  }
  if (update === "DELIVERED") {
    const r = await prisma.campaignRecipient.updateMany({
      where: { ...base, status: "SENT" },
      data: { status: "DELIVERED", deliveredAt: at },
    });
    return r.count;
  }
  if (update === "READ") {
    const fromSent = await prisma.campaignRecipient.updateMany({
      where: { ...base, status: "SENT" },
      data: { status: "READ", deliveredAt: at, readAt: at },
    });
    const fromDelivered = await prisma.campaignRecipient.updateMany({
      where: { ...base, status: "DELIVERED" },
      data: { status: "READ", readAt: at },
    });
    return fromSent.count + fromDelivered.count;
  }
  const failed = await prisma.campaignRecipient.updateMany({
    where: { ...base, status: "SENT" },
    data: { status: "FAILED", failedAt: at, errorMessage: "O WhatsApp informou falha na entrega." },
  });
  return failed.count;
}
