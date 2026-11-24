import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import type { SendMessageResult, WhatsappConnectionConfig } from "@/lib/whatsapp/types";
import { isWithinSendWindow } from "@/lib/campaigns/schedule";
import {
  decideAfterSend,
  earliestSendTime,
  pickGapSeconds,
  remainingToday,
  shouldAutoPauseForFailures,
  shouldAutoPauseForInvalidRate,
} from "@/lib/campaigns/pacing";
import { usesContactName } from "@/lib/campaigns/template";
import {
  canContinueSequence,
  canStartSequence,
  parsePartMessageIds,
  pickPartGapSeconds,
  remainingParts,
  renderSequence,
  withPartMessageId,
  type RenderedPart,
} from "@/lib/campaigns/sequence";
import { splitCaption } from "@/lib/campaigns/caption";
import { applyZapiNameToContacts } from "@/repositories/contact.repository";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import {
  resetDailyCounterIfNewDay,
  recordConnectionSend,
  recordConnectionAttempt,
  tryAcquireDispatchLock,
  releaseDispatchLock,
  type ConnectionCampaignSettingsRow,
} from "@/repositories/connection-campaign-settings.repository";
import { isPhoneOptedOutForTenant } from "@/repositories/tenant-opt-out.repository";
import {
  listRunningCampaignsForDispatch,
  promoteDueScheduledCampaigns,
  failStuckRecipients,
  newClaimToken,
  peekNextPendingRecipient,
  claimNextDueRecipient,
  getCampaignStatus,
  markRecipientSent,
  markRecipientPartSent,
  markRecipientFailed,
  markRecipientInvalidNumber,
  markRecipientOptedOut,
  rescheduleRecipient,
  releaseRecipient,
  lastAttemptedStatuses,
  attemptStats,
  countUnfinishedRecipients,
  pauseCampaignAuto,
  completeCampaign,
  type ClaimedRecipient,
  type RunningCampaignForDispatch,
} from "@/repositories/campaign.repository";
import { resolveCampaignSettings } from "@/services/campaign.service";
import { getTickBudgetMs } from "@/lib/campaigns/budget";
import {
  applyColdPacing,
  coldRemainingToday,
  ensureOptOutInstruction,
  resolveOptOutFooter,
} from "@/lib/campaigns/cold-outreach";

export { getTickBudgetMs };

/** PROCESSING há mais que isso = processo caiu no meio do envio. */
const STUCK_RECIPIENT_THRESHOLD_MS = 10 * 60 * 1000;
/** A trava por conexão dura o orçamento + folga; expira sozinha. */
const LOCK_GRACE_MS = 90_000;
/** Disjuntor de instabilidade: erros temporários seguidos numa execução. */
const MAX_TEMPORARY_STREAK = 5;

export interface DispatchSummary {
  campaignsRunning: number;
  campaignsProcessed: number;
  promotedScheduled: number;
  stuckFailed: number;
  sent: number;
  failed: number;
  retried: number;
  invalid: number;
  optedOut: number;
  /** Sequências interrompidas por falta de tempo (continuam na próxima). */
  suspended: number;
  skipped: { campaignId: string; reason: string }[];
  autoPaused: string[];
  completed: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uma execução do dispatcher (chamada pela rota /api/cron/campaign-dispatcher
 * a cada hit do pinger externo, ~1x/min).
 *
 * Diferente da versão anterior (que mandava em rajada tudo que estava
 * vencido), agora cada conexão envia UMA mensagem por vez, esperando de
 * verdade o intervalo configurado entre elas, até acabar o orçamento de
 * tempo da execução. Proteções:
 * - trava por conexão (UPDATE condicional) — duas execuções nunca enviam
 *   pelo mesmo número ao mesmo tempo;
 * - claim atômico de um destinatário por vez com token (FOR UPDATE SKIP
 *   LOCKED) — ninguém grava resultado de linha que não reivindicou;
 * - status da campanha reconferido antes de cada envio — pausar/cancelar
 *   no painel para o envio na próxima mensagem;
 * - intervalo mínimo medido do último envio REAL da conexão, inclusive
 *   entre execuções (lastSentAt) — sem rajada depois de atraso/backlog.
 */
export async function dispatchDueCampaigns(options: { budgetMs?: number } = {}): Promise<DispatchSummary> {
  const startedAt = Date.now();
  const deadline = startedAt + (options.budgetMs ?? getTickBudgetMs());
  const now = new Date(startedAt);

  const stuck = await failStuckRecipients(new Date(startedAt - STUCK_RECIPIENT_THRESHOLD_MS), now);
  const promoted = await promoteDueScheduledCampaigns(now);
  const campaigns = await listRunningCampaignsForDispatch();

  const summary: DispatchSummary = {
    campaignsRunning: campaigns.length,
    campaignsProcessed: 0,
    promotedScheduled: promoted.count,
    stuckFailed: stuck.count,
    sent: 0,
    failed: 0,
    retried: 0,
    invalid: 0,
    optedOut: 0,
    suspended: 0,
    skipped: [],
    autoPaused: [],
    completed: [],
  };

  // Uma campanha ativa por conexão (regra do startCampaign), mas agrupa
  // por conexão defensivamente: cada número tem seu próprio ritmo e roda
  // em paralelo com os outros; campanhas do mesmo número, em sequência.
  const byConnection = new Map<string, RunningCampaignForDispatch[]>();
  for (const campaign of campaigns) {
    const list = byConnection.get(campaign.connectionId) ?? [];
    list.push(campaign);
    byConnection.set(campaign.connectionId, list);
  }

  await Promise.all(
    [...byConnection.values()].map(async (connectionCampaigns) => {
      for (const campaign of connectionCampaigns) {
        try {
          await dispatchCampaign(campaign, deadline, summary);
        } catch (err) {
          await logBotEvent("error", "campaign_dispatch_uncaught", {
            campaignId: campaign.id,
            connectionId: campaign.connectionId,
            error: serializeError(err),
          });
        }
      }
    })
  );

  return summary;
}

function skipReason(campaign: RunningCampaignForDispatch): string | null {
  if (campaign.organization.status !== "ACTIVE") return "empresa suspensa/cancelada";
  if (!campaign.whatsappModuleInstalled) return "módulo WhatsApp não instalado";
  const settings = campaign.connection.campaignSettings;
  if (!settings) return "conexão sem configuração de campanhas";
  if (!settings.campaignsEnabled) return "campanhas desligadas nesta conexão";
  if (!campaign.connection.apiUrl || !campaign.connection.apiTokenCipher) return "conexão sem credenciais";
  return null;
}

async function dispatchCampaign(campaign: RunningCampaignForDispatch, deadline: number, summary: DispatchSummary) {
  const reason = skipReason(campaign);
  if (reason) {
    summary.skipped.push({ campaignId: campaign.id, reason });
    return;
  }

  const lockToken = newClaimToken();
  const acquired = await tryAcquireDispatchLock(
    campaign.connectionId,
    lockToken,
    new Date(),
    new Date(deadline + LOCK_GRACE_MS)
  );
  if (!acquired) {
    summary.skipped.push({ campaignId: campaign.id, reason: "outra execução já está enviando por este número" });
    return;
  }

  try {
    await runSendLoop(campaign, deadline, lockToken, summary);
  } finally {
    await releaseDispatchLock(campaign.connectionId, lockToken).catch(() => undefined);
  }
}

async function runSendLoop(
  campaign: RunningCampaignForDispatch,
  deadline: number,
  claimToken: string,
  summary: DispatchSummary
) {
  let settings: ConnectionCampaignSettingsRow =
    (await resetDailyCounterIfNewDay(campaign.connectionId, new Date())) ?? campaign.connection.campaignSettings!;
  const cold = campaign.coldOutreach;
  const baseRate = resolveCampaignSettings(campaign.overrides, settings);
  // Contato frio: intervalo entre contatos maior (lib/campaigns/cold-outreach.ts).
  const rate = cold ? applyColdPacing(baseRate, settings) : baseRate;
  const provider = getWhatsappProvider(campaign.connection.provider.key);
  const config: WhatsappConnectionConfig = {
    apiUrl: campaign.connection.apiUrl!,
    apiToken: decryptSecret(campaign.connection.apiTokenCipher!),
    phoneNumber: campaign.connection.phoneNumber,
  };
  const businessName =
    campaign.connection.businessName || campaign.organization.messageBusinessName || campaign.organization.name;
  // Contato frio: rodapé de SAIR obrigatório, mesmo desligado no painel.
  const footer = resolveOptOutFooter(settings, cold);
  // Tamanho da sequência (o rodapé pode virar uma parte extra quando só há
  // áudios) — o conteúdo de verdade é montado por destinatário.
  const sequenceLength = buildRecipientSequence(campaign, { name: null, phone: "", businessName }, footer).length;

  const stats = await attemptStats(campaign.id);
  let attempted = stats.attempted;
  let invalid = stats.invalid;
  let lastSentAt = settings.lastSentAt;
  let dailySentCount = settings.dailySentCount;
  let coldDailySentCount = settings.coldDailySentCount;
  let warmupStartedAt = settings.warmupStartedAt;
  let gapSeconds = pickGapSeconds(attempted, rate);
  let temporaryStreak = 0;
  let processedAny = false;

  while (Date.now() < deadline) {
    const now = new Date();
    if (!isWithinSendWindow(now, settings)) break;

    const remaining = Math.min(
      remainingToday(
        { dailyLimit: settings.dailyLimit, dailySentCount, warmupEnabled: settings.warmupEnabled, warmupStartedAt },
        now
      ),
      // Teto próprio de contato frio por conexão (soma todas as campanhas
      // frias do número), sempre junto com o limite normal e o aquecimento.
      cold ? coldRemainingToday(settings.coldDailyLimit, coldDailySentCount) : Number.POSITIVE_INFINITY
    );
    if (remaining <= 0) break;

    const status = await getCampaignStatus(campaign.id);
    if (status?.status !== "RUNNING") break;

    const next = await peekNextPendingRecipient(campaign.id);
    if (!next?.scheduledAt) break;

    const sendAt = earliestSendTime(next.scheduledAt, lastSentAt, gapSeconds);
    const waitMs = Math.max(0, sendAt.getTime() - Date.now());
    // Só começa (ou espera pra começar) a sequência deste destinatário se
    // ela couber INTEIRA no que resta do orçamento; senão a próxima
    // execução do cron continua daqui (o horário fica no banco).
    const partsLeft = Math.max(1, sequenceLength - next.nextPartIndex);
    if (
      !canStartSequence(Date.now() + waitMs, deadline, partsLeft, campaign.maxPartIntervalSeconds, true)
    ) {
      break;
    }
    if (waitMs > 0) {
      await sleep(waitMs);
      continue; // re-checa status/janela/limite depois da espera
    }

    const recipient = await claimNextDueRecipient(campaign.id, new Date(), claimToken);
    if (!recipient) break;
    processedAny = true;

    // Reconfere o status logo antes de enviar — pausa/cancelamento feitos
    // durante a espera acima param aqui, sem mandar.
    const statusNow = await getCampaignStatus(campaign.id);
    if (statusNow?.status !== "RUNNING") {
      await releaseRecipient(recipient.id, claimToken);
      break;
    }

    const outcome = await processRecipient(recipient, campaign, provider, config, settings, businessName, footer, deadline);

    if (outcome.countedToday) {
      dailySentCount++;
      if (cold) coldDailySentCount++;
      if (!warmupStartedAt) warmupStartedAt = outcome.at;
    }
    switch (outcome.kind) {
      case "opted_out":
        summary.optedOut++;
        continue; // não usou a Z-API — não precisa esperar intervalo
      case "suspended":
        // Acabou o tempo no meio da sequência (algo demorou mais que o
        // estimado): volta pra fila, a próxima execução continua da parte
        // que faltou.
        lastSentAt = outcome.at;
        summary.suspended++;
        break;
      case "invalid":
        summary.invalid++;
        invalid++;
        attempted++;
        break;
      case "sent":
        summary.sent++;
        attempted++;
        temporaryStreak = 0;
        break;
      case "retry":
        summary.retried++;
        temporaryStreak++;
        break;
      case "failed":
        summary.failed++;
        attempted++;
        break;
    }
    if (outcome.kind === "suspended") break;

    // Toda chamada à Z-API (inclusive phone-exists com resultado
    // "inválido") conta como "último envio" pro intervalo.
    lastSentAt = outcome.at;
    if (outcome.kind !== "sent") await recordConnectionAttempt(campaign.connectionId, outcome.at);
    gapSeconds = pickGapSeconds(attempted, rate);

    // Disjuntores.
    const recent = await lastAttemptedStatuses(campaign.id, settings.maxConsecutiveErrors);
    if (shouldAutoPauseForFailures(recent, settings.maxConsecutiveErrors)) {
      await autoPause(campaign.id, `Pausada automaticamente após ${settings.maxConsecutiveErrors} falhas de envio seguidas.`, summary);
      return;
    }
    if (temporaryStreak >= MAX_TEMPORARY_STREAK) {
      await autoPause(
        campaign.id,
        `Pausada automaticamente: ${temporaryStreak} erros temporários seguidos (instância instável ou fora do ar).`,
        summary
      );
      return;
    }
    if (shouldAutoPauseForInvalidRate(invalid, attempted)) {
      await autoPause(
        campaign.id,
        `Pausada automaticamente: ${Math.round((invalid / attempted) * 100)}% dos números não têm WhatsApp — revise a lista antes de continuar (lista de baixa qualidade aumenta o risco de bloqueio).`,
        summary
      );
      return;
    }

    // Recarrega a config do número a cada envio (o tenant pode ter mudado
    // janela/limite/desligado campanhas no painel durante a execução).
    const fresh = await resetDailyCounterIfNewDay(campaign.connectionId, new Date());
    if (fresh) {
      settings = fresh;
      dailySentCount = fresh.dailySentCount;
      coldDailySentCount = fresh.coldDailySentCount;
      if (!fresh.campaignsEnabled) break;
    }
  }

  if (processedAny) summary.campaignsProcessed++;

  const unfinished = await countUnfinishedRecipients(campaign.id);
  if (unfinished === 0) {
    const done = await completeCampaign(campaign.id, new Date());
    if (done.count > 0) summary.completed.push(campaign.id);
  }
}

/** Sequência final de um destinatário. Campanha fria: garante a instrução
 * de SAIR na mensagem que chega (ensureOptOutInstruction), mesmo que o
 * texto use "sair" de outro jeito ou só tenha mídia/áudio. */
function buildRecipientSequence(
  campaign: RunningCampaignForDispatch,
  ctx: { name: string | null; phone: string; businessName: string },
  footer: string | null
): RenderedPart[] {
  const rendered = renderSequence(campaign.parts, ctx, footer);
  return campaign.coldOutreach && footer ? ensureOptOutInstruction(rendered, footer) : rendered;
}

async function autoPause(campaignId: string, reason: string, summary: DispatchSummary) {
  const result = await pauseCampaignAuto(campaignId, reason);
  if (result.count > 0) summary.autoPaused.push(campaignId);
}

type RecipientResult = {
  kind: "opted_out" | "invalid" | "sent" | "retry" | "failed" | "suspended";
  at: Date;
  /** A 1ª parte saiu nesta tentativa → conta no limite diário/aquecimento
   * (o limite é por DESTINATÁRIO, não por mensagem — ver sequence.ts). */
  countedToday: boolean;
};

/**
 * Manda (ou continua) a sequência de UM destinatário.
 *
 * - Começa em `recipient.nextPartIndex` — partes que já saíram numa
 *   tentativa anterior nunca são reenviadas.
 * - Depois de CADA parte enviada grava o progresso (nextPartIndex +
 *   messageId) antes de esperar o intervalo e mandar a próxima.
 * - Entre partes: intervalo aleatório campaign.min/maxPartIntervalSeconds.
 * - Erro temporário numa parte → volta pra fila (backoff) e a retentativa
 *   continua DESTA parte; erro definitivo → FAILED, dizendo qual parte.
 * - Pausar/cancelar a campanha no meio NÃO corta a sequência de quem já
 *   começou a receber (são segundos) — vale a partir do próximo contato.
 */
async function processRecipient(
  recipient: ClaimedRecipient,
  campaign: RunningCampaignForDispatch,
  provider: ReturnType<typeof getWhatsappProvider>,
  config: WhatsappConnectionConfig,
  settings: ConnectionCampaignSettingsRow,
  businessName: string,
  footer: string | null,
  deadline: number
): Promise<RecipientResult> {
  if (recipient.optedOut || (await isPhoneOptedOutForTenant(campaign.tenantId, recipient.phone))) {
    await markRecipientOptedOut(recipient.id, recipient.claimToken);
    return { kind: "opted_out", at: new Date(), countedToday: false };
  }

  const isFirstAttempt = recipient.nextPartIndex === 0;
  let targetPhone = recipient.phone;
  if (settings.verifyNumbersBeforeSend) {
    const check = await provider.checkPhoneExists(config, recipient.phone);
    if (isFirstAttempt && check.ok && check.exists === false) {
      const at = new Date();
      await markRecipientInvalidNumber(recipient.id, recipient.claimToken, at);
      return { kind: "invalid", at, countedToday: false };
    }
    // Número no formato que o WhatsApp reconhece (ex.: 9º dígito).
    if (check.ok && check.exists && check.phone) targetPhone = check.phone;
    // check.ok === false → não deu pra verificar; segue com o envio.
  }

  // Contato sem nome e algum texto usa {{nome}}/{{primeiro_nome}}: pergunta
  // o nome pra Z-API (agenda do número conectado > perfil do WhatsApp) e
  // grava no contato — nunca por cima de nome de CSV/manual. Sem nome, vale
  // o fallback {{nome|cliente}}.
  let contactName = recipient.name?.trim() || null;
  if (!contactName && campaign.parts.some((p) => p.text && usesContactName(p.text))) {
    const lookup = await provider.getContactName(config, targetPhone).catch(() => ({ ok: false as const }));
    if (lookup.ok && "name" in lookup && lookup.name) {
      contactName = lookup.name;
      await applyZapiNameToContacts(
        { contactId: recipient.contactId },
        { name: lookup.name, source: lookup.nameSource ?? "whatsapp" }
      ).catch(() => 0);
    }
  }

  const rendered = buildRecipientSequence(campaign, { name: contactName, phone: recipient.phone, businessName }, footer);
  const total = rendered.length;
  const toSend = remainingParts(rendered, recipient.nextPartIndex);
  let messageIds = parsePartMessageIds(recipient.partMessageIds);
  let countedToday = false;
  let lastAt = new Date();

  for (let n = 0; n < toSend.length; n++) {
    const part = toSend[n];
    if (n > 0) {
      const gap = pickPartGapSeconds(campaign.minPartIntervalSeconds, campaign.maxPartIntervalSeconds);
      if (!canContinueSequence(Date.now(), deadline, gap)) {
        await releaseRecipient(recipient.id, recipient.claimToken);
        return { kind: "suspended", at: lastAt, countedToday };
      }
      await sleep(gap * 1000);
    }

    const result = await sendPart(provider, config, targetPhone, part, campaign.id);
    const at = new Date();
    lastAt = at;

    if (result.ok) {
      messageIds = withPartMessageId(messageIds, part.index, result.messageId ?? null);
      await markRecipientPartSent(recipient.id, recipient.claimToken, part.index, messageIds, at);
      if (part.index === 0) {
        // 1ª parte: conta o destinatário no limite diário / aquecimento.
        await recordConnectionSend(campaign.connectionId, at, !settings.warmupStartedAt, campaign.coldOutreach);
        countedToday = true;
      } else {
        await recordConnectionAttempt(campaign.connectionId, at);
      }
      continue;
    }

    const label = total > 1 ? `Mensagem ${part.index + 1} de ${total}` : "Envio";
    const already = part.index > 0 ? " (as anteriores já foram entregues e não serão reenviadas)" : "";
    const decision = decideAfterSend(
      false,
      { httpStatus: result.httpStatus, networkError: result.networkError },
      recipient.attempts,
      settings.maxAttempts,
      at
    );
    if (decision.kind === "retry") {
      await rescheduleRecipient(
        recipient.id,
        recipient.claimToken,
        decision.at,
        `${label} — tentativa ${recipient.attempts}/${settings.maxAttempts}: ${result.message}${already}`
      );
      return { kind: "retry", at, countedToday };
    }
    await markRecipientFailed(recipient.id, recipient.claimToken, at, `${label} falhou: ${result.message}${already}`);
    return { kind: "failed", at, countedToday };
  }

  // Sequência completa. Entregue/lido do destinatário seguem a 1ª parte.
  const firstId = messageIds[0] ?? recipient.providerMessageId ?? null;
  await markRecipientSent(recipient.id, recipient.claimToken, lastAt, firstId);
  return { kind: "sent", at: lastAt, countedToday };
}

/** Uma parte da sequência:
 * - texto: send-text;
 * - imagem/vídeo/documento: mídia com o texto como LEGENDA (mesma
 *   mensagem); passando de MEDIA_CAPTION_MAX, a legenda leva o começo e o
 *   resto vai como texto logo em seguida (dentro da mesma parte);
 * - áudio: só o áudio.
 * Se a mídia saiu e só o texto complementar falhou, a parte conta como
 * enviada (reenviar duplicaria a mídia) e fica registrado no log. */
async function sendPart(
  provider: ReturnType<typeof getWhatsappProvider>,
  config: WhatsappConnectionConfig,
  to: string,
  part: RenderedPart,
  campaignId: string
): Promise<SendMessageResult> {
  if (part.type === "text" || !part.mediaUrl) return provider.sendMessage(config, to, part.text);
  if (part.type === "audio") return provider.sendAudio(config, to, part.mediaUrl);

  const { caption, rest } = splitCaption(part.text);
  const captionArg = caption || undefined;
  let media: SendMessageResult;
  switch (part.type) {
    case "image":
      media = await provider.sendImage(config, to, part.mediaUrl, captionArg);
      break;
    case "video":
      media = await provider.sendVideo(config, to, part.mediaUrl, captionArg);
      break;
    case "document":
      media = await provider.sendDocument(config, to, part.mediaUrl, part.fileName || "arquivo.pdf", captionArg);
      break;
  }

  if (!media.ok || !rest) return media;
  const textResult = await provider.sendMessage(config, to, rest, { delayMessage: 2 });
  if (!textResult.ok) {
    await logBotEvent("warn", "campaign_follow_up_text_failed", {
      campaignId,
      to,
      partIndex: part.index,
      message: textResult.message,
    });
  }
  return media;
}
