import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { getListSummary, listMembersOfList } from "@/repositories/contact-list.repository";
import {
  getOrCreateConnectionCampaignSettings,
  updateConnectionCampaignSettings,
  type ConnectionCampaignSettingsRow,
  type UpdateConnectionCampaignSettingsInput,
} from "@/repositories/connection-campaign-settings.repository";
import {
  createCampaignWithRecipients,
  getCampaignSummary,
  getCampaignDetail as getCampaignDetailRepo,
  listCampaignsForConnection as listCampaignsForConnectionRepo,
  findActiveCampaignForConnection,
  markCampaignRunning,
  markCampaignPaused,
  markCampaignCancelled,
  getPendingRecipientIds,
  scheduleRecipients,
  type CampaignOverridesInput,
} from "@/repositories/campaign.repository";
import { computeSchedule, type RateSettings } from "@/lib/campaigns/schedule";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/server/errors";

// --- Configurações de ritmo por conexão ---------------------------------------

export async function getConnectionCampaignSettings(
  tenantId: string,
  connectionId: string
): Promise<ConnectionCampaignSettingsRow> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  return getOrCreateConnectionCampaignSettings(connectionId);
}

function isValidHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function updateConnectionCampaignSettingsForTenant(
  tenantId: string,
  connectionId: string,
  input: UpdateConnectionCampaignSettingsInput
): Promise<void> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  if (!isValidHHmm(input.sendWindowStart) || !isValidHHmm(input.sendWindowEnd)) {
    throw new ValidationError("Horários da janela de envio inválidos — use o formato HH:mm.");
  }
  if (input.sendWindowStart >= input.sendWindowEnd) {
    throw new ValidationError("O início da janela de envio precisa ser antes do fim.");
  }
  if (input.batchSize < 1) throw new ValidationError("O tamanho do lote precisa ser pelo menos 1.");
  if (input.minMessageIntervalSeconds < 1 || input.minMessageIntervalSeconds > input.maxMessageIntervalSeconds) {
    throw new ValidationError("Intervalo entre mensagens inválido.");
  }
  if (input.minBatchPauseSeconds < 0 || input.minBatchPauseSeconds > input.maxBatchPauseSeconds) {
    throw new ValidationError("Pausa entre lotes inválida.");
  }
  if (input.dailyLimit !== null && input.dailyLimit < 1) {
    throw new ValidationError("O limite diário precisa ser pelo menos 1 (ou vazio para sem limite).");
  }
  if (input.maxConsecutiveErrors < 1) {
    throw new ValidationError("O número de falhas consecutivas precisa ser pelo menos 1.");
  }

  // Guarantees the row exists before updateMany touches it (a connection
  // that never had its settings read yet has no row to update).
  await getOrCreateConnectionCampaignSettings(connectionId);
  await updateConnectionCampaignSettings(connectionId, input);
}

/** Merges a campaign's optional per-campaign overrides onto the connection's
 * settings — null overrides fall back to the connection default. Named to
 * match the comment on Campaign's override columns in schema.prisma. Send
 * window is always the connection's — campaigns don't override it. */
export function resolveCampaignSettings(
  overrides: CampaignOverridesInput,
  connectionSettings: ConnectionCampaignSettingsRow
): RateSettings {
  return {
    sendWindowStart: connectionSettings.sendWindowStart,
    sendWindowEnd: connectionSettings.sendWindowEnd,
    batchSize: overrides.batchSize ?? connectionSettings.batchSize,
    minMessageIntervalSeconds: overrides.minMessageIntervalSeconds ?? connectionSettings.minMessageIntervalSeconds,
    maxMessageIntervalSeconds: overrides.maxMessageIntervalSeconds ?? connectionSettings.maxMessageIntervalSeconds,
    minBatchPauseSeconds: overrides.minBatchPauseSeconds ?? connectionSettings.minBatchPauseSeconds,
    maxBatchPauseSeconds: overrides.maxBatchPauseSeconds ?? connectionSettings.maxBatchPauseSeconds,
  };
}

// --- Criação -------------------------------------------------------------------

export interface CreateCampaignInput {
  connectionId: string;
  listId: string;
  name: string;
  messageText: string;
  mediaType: "image" | "video" | null;
  mediaUrl: string | null;
  overrides: CampaignOverridesInput;
}

export async function createCampaign(tenantId: string, input: CreateCampaignInput) {
  const name = input.name.trim();
  const messageText = input.messageText.trim();
  if (!name) throw new ValidationError("Informe um nome para a campanha.");
  if (!messageText) throw new ValidationError("Informe o texto da mensagem.");
  if (input.mediaType && !input.mediaUrl?.trim()) {
    throw new ValidationError("Informe a URL da mídia.");
  }

  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const list = await getListSummary(tenantId, input.listId);
  if (!list || list.connectionId !== input.connectionId) throw new NotFoundError("Lista não encontrada.");

  const members = await listMembersOfList(tenantId, input.listId);
  const contactIds = members.filter((m) => !m.optedOut).map((m) => m.contactId);
  if (contactIds.length === 0) {
    throw new ValidationError("Essa lista não tem nenhum contato ativo (não opt-out) para enviar.");
  }

  // Guarantees ConnectionCampaignSettings exists before any campaign points
  // at this connection — the dispatcher assumes it's always there.
  await getOrCreateConnectionCampaignSettings(input.connectionId);

  return createCampaignWithRecipients({
    tenantId,
    connectionId: input.connectionId,
    listId: input.listId,
    name,
    messageText,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl?.trim() || null,
    contactIds,
    overrides: input.overrides,
  });
}

// --- Leitura ---------------------------------------------------------------

export function listCampaignsForConnection(tenantId: string, connectionId: string) {
  return listCampaignsForConnectionRepo(tenantId, connectionId);
}

export async function getCampaignDetail(tenantId: string, campaignId: string) {
  const detail = await getCampaignDetailRepo(tenantId, campaignId);
  if (!detail) throw new NotFoundError("Campanha não encontrada.");
  return detail;
}

// --- Transições --------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["RUNNING", "PAUSED"]);

export async function startCampaign(tenantId: string, campaignId: string, consentConfirmed: boolean) {
  if (!consentConfirmed) {
    throw new ValidationError("Confirme que sua empresa tem base legal para enviar essas mensagens.");
  }

  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") {
    throw new ConflictError("Essa campanha não pode ser iniciada no estado atual.");
  }

  const active = await findActiveCampaignForConnection(tenantId, campaign.connectionId);
  if (active && active.id !== campaignId) {
    throw new ConflictError("Já existe uma campanha em andamento (ou pausada) nessa conexão. Finalize-a antes de iniciar outra.");
  }

  const connectionSettings = await getOrCreateConnectionCampaignSettings(campaign.connectionId);
  const settings = resolveCampaignSettings(
    {
      batchSize: campaign.batchSize,
      minMessageIntervalSeconds: campaign.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: campaign.maxMessageIntervalSeconds,
      minBatchPauseSeconds: campaign.minBatchPauseSeconds,
      maxBatchPauseSeconds: campaign.maxBatchPauseSeconds,
    },
    connectionSettings
  );

  const pendingIds = await getPendingRecipientIds(campaignId);
  if (pendingIds.length === 0) {
    throw new ConflictError("Essa campanha não tem mais nenhum destinatário pendente.");
  }
  const scheduledAt = computeSchedule(pendingIds.length, new Date(), settings);
  await scheduleRecipients(pendingIds, scheduledAt);

  // consentConfirmed is a one-time declaration — true forever once given,
  // never reset by a later pause/resume.
  await markCampaignRunning(tenantId, campaignId, campaign.startedAt ?? new Date(), true);
}

export async function pauseCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "RUNNING") throw new ConflictError("Só é possível pausar uma campanha em andamento.");
  await markCampaignPaused(tenantId, campaignId, "Pausada manualmente.");
}

export async function cancelCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (!ACTIVE_STATUSES.has(campaign.status) && campaign.status !== "DRAFT") {
    throw new ConflictError("Essa campanha já está finalizada.");
  }
  await markCampaignCancelled(tenantId, campaignId, new Date());
}
