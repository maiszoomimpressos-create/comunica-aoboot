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
  markCampaignScheduled,
  markCampaignPaused,
  markCampaignCancelled,
  requeueFailedRecipients,
  getPendingRecipientIds,
  scheduleRecipients,
  type CampaignOverridesInput,
  type RecipientPageQuery,
} from "@/repositories/campaign.repository";
import { listOptedOutPhoneKeys } from "@/repositories/tenant-opt-out.repository";
import { computeSchedule, type RateSettings } from "@/lib/campaigns/schedule";
import {
  maxPartIntervalForBudget,
  PART_INTERVAL_LIMITS,
  sequenceFitsBudget,
  summarizePartsText,
  validateParts,
  type CampaignPart,
} from "@/lib/campaigns/sequence";
import { getTickBudgetMs } from "@/lib/campaigns/budget";
import { applyColdPacing, COLD_LIMITS } from "@/lib/campaigns/cold-outreach";
import { phoneKey } from "@/lib/whatsapp/phone-sanitize";
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

/** Teto de configuração da janela (CAMPAIGN_DEFAULTS.sendWindowEndMax) —
 * agora validado também no servidor, não só na tela. */
const SEND_WINDOW_END_MAX = "20:00";
/** Intervalo mínimo entre mensagens que o painel aceita — abaixo disso o
 * número vira alvo fácil de bloqueio. */
const MIN_MESSAGE_INTERVAL_FLOOR = 5;

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
  if (input.sendWindowEnd > SEND_WINDOW_END_MAX) {
    throw new ValidationError(`A janela de envio pode ir no máximo até ${SEND_WINDOW_END_MAX}.`);
  }
  if (input.batchSize < 1) throw new ValidationError("O tamanho do lote precisa ser pelo menos 1.");
  if (
    input.minMessageIntervalSeconds < MIN_MESSAGE_INTERVAL_FLOOR ||
    input.minMessageIntervalSeconds > input.maxMessageIntervalSeconds
  ) {
    throw new ValidationError(
      `Intervalo entre mensagens inválido (mínimo ${MIN_MESSAGE_INTERVAL_FLOOR}s, e o mínimo não pode passar do máximo).`
    );
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
  if (input.maxAttempts < 1 || input.maxAttempts > 10) {
    throw new ValidationError("Tentativas por destinatário: entre 1 e 10.");
  }
  if (input.coldDailyLimit < 1 || input.coldDailyLimit > COLD_LIMITS.dailyLimitMax) {
    throw new ValidationError(`Limite diário de contatos frios: entre 1 e ${COLD_LIMITS.dailyLimitMax}.`);
  }
  if (
    input.coldMinMessageIntervalSeconds < COLD_LIMITS.minIntervalFloor ||
    input.coldMinMessageIntervalSeconds > input.coldMaxMessageIntervalSeconds
  ) {
    throw new ValidationError(
      `Intervalo entre contatos frios inválido (mínimo ${COLD_LIMITS.minIntervalFloor}s, e o mínimo não pode passar do máximo).`
    );
  }
  const footer = input.optOutFooterText?.trim() || null;
  if (footer && footer.length > 200) throw new ValidationError("O rodapé pode ter no máximo 200 caracteres.");
  if (footer && !/\bSAIR\b/i.test(footer)) {
    throw new ValidationError('O rodapé precisa mencionar a palavra "SAIR" (é ela que o sistema reconhece).');
  }

  // Guarantees the row exists before updateMany touches it.
  await getOrCreateConnectionCampaignSettings(connectionId);
  await updateConnectionCampaignSettings(connectionId, { ...input, optOutFooterText: footer });
}

/** Merges a campaign's optional per-campaign overrides onto the connection's
 * settings — null overrides fall back to the connection default. Send
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
  /** Sequência de mensagens, em ordem (1 a MAX_CAMPAIGN_PARTS). */
  parts: CampaignPart[];
  minPartIntervalSeconds: number;
  maxPartIntervalSeconds: number;
  overrides: CampaignOverridesInput;
  /** Obrigatório quando a lista tem contato frio (captado do Google): quem
   * cria confirma que a mensagem é relevante pro negócio do destinatário e
   * identifica a empresa (legítimo interesse, LGPD). */
  coldOutreachConfirmed?: boolean;
}

function normalizePart(part: CampaignPart): CampaignPart {
  const type = part.type;
  const text = type === "audio" ? null : part.text?.trim() || null;
  let mediaUrl: string | null = null;
  if (type !== "text") {
    const trimmed = part.mediaUrl?.trim() || null;
    try {
      mediaUrl = trimmed ? new URL(trimmed).toString() : null;
    } catch {
      mediaUrl = trimmed; // validateParts devolve a mensagem certa
    }
  }
  return { type, text, mediaUrl, fileName: type === "document" ? part.fileName?.trim() || null : null };
}

export async function createCampaign(tenantId: string, input: CreateCampaignInput) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Informe um nome para a campanha.");

  const parts = input.parts.map(normalizePart);
  const partsError = validateParts(parts);
  if (partsError) throw new ValidationError(partsError);

  const minGap = Math.round(input.minPartIntervalSeconds);
  const maxGap = Math.round(input.maxPartIntervalSeconds);
  if (
    !Number.isFinite(minGap) ||
    !Number.isFinite(maxGap) ||
    minGap < PART_INTERVAL_LIMITS.min ||
    maxGap > PART_INTERVAL_LIMITS.max ||
    minGap > maxGap
  ) {
    throw new ValidationError(
      `Intervalo entre mensagens da sequência inválido (de ${PART_INTERVAL_LIMITS.min} a ${PART_INTERVAL_LIMITS.max} s, mínimo ≤ máximo).`
    );
  }
  // Cada destinatário recebe a sequência inteira numa execução do cron —
  // ela precisa caber no orçamento de tempo (ver sequence.ts).
  const budgetMs = getTickBudgetMs();
  if (!sequenceFitsBudget(parts.length, maxGap, budgetMs)) {
    throw new ValidationError(
      `Com ${parts.length} mensagens, o intervalo máximo entre elas pode ser de até ${maxPartIntervalForBudget(parts.length, budgetMs)} s (a sequência de cada contato precisa caber numa execução de ${Math.round(budgetMs / 1000)} s).`
    );
  }

  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  // Qualquer lista do tenant pode ser usada — quem envia é sempre a
  // conexão escolhida aqui (input.connectionId), nunca a origem do contato.
  const list = await getListSummary(tenantId, input.listId);
  if (!list) throw new NotFoundError("Lista não encontrada.");

  const [members, optedOutKeys] = await Promise.all([
    listMembersOfList(tenantId, input.listId),
    listOptedOutPhoneKeys(tenantId),
  ]);
  // Um mesmo telefone pode estar na lista duas vezes (contatos de
  // conexões diferentes) — só o primeiro vira destinatário.
  const seenPhones = new Set<string>();
  const contactIds: string[] = [];
  let coldCount = 0;
  for (const m of members) {
    if (m.optedOut) continue;
    const key = phoneKey(m.phone);
    if (optedOutKeys.has(key) || seenPhones.has(key)) continue;
    seenPhones.add(key);
    contactIds.push(m.contactId);
    if (m.isCold) coldCount++;
  }
  if (contactIds.length === 0) {
    throw new ValidationError("Essa lista não tem nenhum contato ativo (não opt-out) para enviar.");
  }

  // Lista com contato frio → a campanha inteira segue as regras de frio
  // (mais seguro que misturar ritmos na mesma fila).
  const coldOutreach = coldCount > 0;
  if (coldOutreach && !input.coldOutreachConfirmed) {
    throw new ValidationError(
      `Essa lista tem ${coldCount} contato(s) captado(s) do Google (contato frio). Confirme que a mensagem é relevante para o negócio deles e identifica a sua empresa.`
    );
  }

  await getOrCreateConnectionCampaignSettings(input.connectionId);

  return createCampaignWithRecipients({
    tenantId,
    connectionId: input.connectionId,
    listId: input.listId,
    name,
    // Resumo dos textos (telas antigas / "usa {{nome}}?"); a mídia agora
    // vive nas partes.
    messageText: summarizePartsText(parts),
    mediaType: null,
    mediaUrl: null,
    mediaFileName: null,
    parts,
    minPartIntervalSeconds: minGap,
    maxPartIntervalSeconds: maxGap,
    coldOutreach,
    contactIds,
    overrides: input.overrides,
  });
}

// --- Leitura ---------------------------------------------------------------

export function listCampaignsForConnection(tenantId: string, connectionId: string) {
  return listCampaignsForConnectionRepo(tenantId, connectionId);
}

export async function getCampaignDetail(
  tenantId: string,
  campaignId: string,
  query: RecipientPageQuery = { page: 1, pageSize: 50, status: null }
) {
  const detail = await getCampaignDetailRepo(tenantId, campaignId, query);
  if (!detail) throw new NotFoundError("Campanha não encontrada.");
  return detail;
}

/** Resolve o connectionId dono desta campanha, pra checagem de connection
 * scope na camada de action antes de start/pause/cancel. */
export async function getCampaignConnectionId(tenantId: string, campaignId: string): Promise<string> {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  return campaign.connectionId;
}

// --- Transições --------------------------------------------------------------

/** Início agendado só vale se for pelo menos 1 min no futuro (senão é
 * "começar agora") e no máximo 60 dias à frente. */
const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;

export async function startCampaign(
  tenantId: string,
  campaignId: string,
  consentConfirmed: boolean,
  scheduledStartAt: Date | null = null
) {
  if (!consentConfirmed) {
    throw new ValidationError("Confirme que sua empresa tem base legal para enviar essas mensagens.");
  }

  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") {
    throw new ConflictError("Essa campanha não pode ser iniciada no estado atual.");
  }

  const now = new Date();
  if (scheduledStartAt) {
    if (Number.isNaN(scheduledStartAt.getTime())) throw new ValidationError("Data de início inválida.");
    if (scheduledStartAt.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      throw new ValidationError("Dá pra agendar no máximo 60 dias à frente.");
    }
  }
  const isScheduled = !!scheduledStartAt && scheduledStartAt.getTime() - now.getTime() >= MIN_SCHEDULE_AHEAD_MS;

  const active = await findActiveCampaignForConnection(tenantId, campaign.connectionId);
  if (active && active.id !== campaignId) {
    throw new ConflictError(
      "Já existe uma campanha agendada, em andamento ou pausada nessa conexão. Finalize-a antes de iniciar outra."
    );
  }

  const connectionSettings = await getOrCreateConnectionCampaignSettings(campaign.connectionId);
  if (!connectionSettings.campaignsEnabled) {
    throw new ConflictError("Campanhas estão desligadas nesta conexão (Configurações de disparo).");
  }
  const baseSettings = resolveCampaignSettings(
    {
      batchSize: campaign.batchSize,
      minMessageIntervalSeconds: campaign.minMessageIntervalSeconds,
      maxMessageIntervalSeconds: campaign.maxMessageIntervalSeconds,
      minBatchPauseSeconds: campaign.minBatchPauseSeconds,
      maxBatchPauseSeconds: campaign.maxBatchPauseSeconds,
    },
    connectionSettings
  );
  const settings = campaign.coldOutreach ? applyColdPacing(baseSettings, connectionSettings) : baseSettings;

  const pendingIds = await getPendingRecipientIds(campaignId);
  if (pendingIds.length === 0) {
    throw new ConflictError("Essa campanha não tem mais nenhum destinatário pendente.");
  }
  const startAt = isScheduled ? scheduledStartAt! : now;
  const scheduledAt = computeSchedule(pendingIds.length, startAt, settings);
  await scheduleRecipients(pendingIds, scheduledAt);

  const from = [campaign.status];
  const result = isScheduled
    ? await markCampaignScheduled(tenantId, campaignId, from, startAt)
    : await markCampaignRunning(tenantId, campaignId, from, campaign.startedAt ?? now);
  if (result.count === 0) throw new ConflictError("A campanha mudou de estado enquanto você confirmava — recarregue.");
  return { status: isScheduled ? ("SCHEDULED" as const) : ("RUNNING" as const), firstSendAt: scheduledAt[0] };
}

export async function pauseCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "RUNNING" && campaign.status !== "SCHEDULED") {
    throw new ConflictError("Só é possível pausar uma campanha agendada ou em andamento.");
  }
  const result = await markCampaignPaused(tenantId, campaignId, "Pausada manualmente.");
  if (result.count === 0) throw new ConflictError("A campanha mudou de estado — recarregue a página.");
}

export async function cancelCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
    throw new ConflictError("Essa campanha já está finalizada.");
  }
  const result = await markCampaignCancelled(tenantId, campaignId, new Date());
  if (result.count === 0) throw new ConflictError("A campanha mudou de estado — recarregue a página.");
}

/** "Reenviar falhas": só com a campanha parada (pausada ou concluída). */
export async function retryFailedRecipients(tenantId: string, campaignId: string) {
  const campaign = await getCampaignSummary(tenantId, campaignId);
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "PAUSED" && campaign.status !== "COMPLETED") {
    throw new ConflictError("Pause a campanha (ou espere ela concluir) antes de reenviar as falhas.");
  }
  if (campaign.status === "COMPLETED") {
    const active = await findActiveCampaignForConnection(tenantId, campaign.connectionId);
    if (active && active.id !== campaignId) {
      throw new ConflictError("Outra campanha está ativa nesta conexão — finalize-a antes de reenviar estas falhas.");
    }
  }
  const result = await requeueFailedRecipients(tenantId, campaignId);
  if (result.count === 0) throw new ConflictError("Não há falhas para reenviar.");
  return { requeued: result.count };
}
