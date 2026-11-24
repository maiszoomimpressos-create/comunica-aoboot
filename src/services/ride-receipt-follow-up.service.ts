import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import { NotFoundError, ValidationError } from "@/lib/server/errors";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import {
  getAppPromoSettings,
  getTenantMessageNames,
  upsertAppPromoSettings,
} from "@/repositories/app-promo-settings.repository";
import {
  claimDueRideReceiptFollowUps,
  createRideReceiptFollowUpIfAbsent,
  markRideReceiptFollowUpCancelled,
  markRideReceiptFollowUpFailed,
  markRideReceiptFollowUpImageSent,
  markRideReceiptFollowUpSent,
  recoverStuckRideReceiptFollowUps,
  rescheduleRideReceiptFollowUp,
  type ClaimedRideReceiptFollowUp,
} from "@/repositories/ride-receipt-follow-up.repository";
import {
  APP_PROMO_CAPTION_MAX_LENGTH,
  APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH,
  APP_PROMO_LINK_TITLE_MAX_LENGTH,
  randomAppPromoDelayMs,
  randomAppPromoLinkGapMs,
  renderAppPromoImageCaption,
  renderAppPromoLinkDescription,
  renderAppPromoLinkMessage,
  renderAppPromoLinkTitle,
} from "@/config/ride-receipt-app-promo";
import { buildShortLinkUrl } from "@/config/short-links";
import { ensureShortLinkForTenant, validateSlugOrThrow } from "@/services/short-link.service";

/** Teto de envios por tick — cada envio são 2 mensagens com 3-6 s entre
 * elas, então 6 por tick cabem com folga no maxDuration (60 s) da rota;
 * com o pinger ~1x/min, o resto sai no tick seguinte. */
const CLAIM_LIMIT_PER_TICK = 6;
/** PROCESSING há mais que isso = processo caiu no meio; volta pra PENDING. */
const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
/** Tentativas totais (a primeira + retentativas) antes de virar FAILED. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2 * 60 * 1000;
/** Se o cron ficou parado e a imagem venceu há mais que isso, ela não é
 * mais enviada — chegar horas depois da corrida não faz sentido. */
const EXPIRE_AFTER_MS = 60 * 60 * 1000;

const MAX_UPLOAD_BYTES = 1_000_000;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ---------------------------------------------------------------------
// Agendamento (chamado por sendPurchaseConfirmation)
// ---------------------------------------------------------------------

function stableStringify(value: Record<string, string>): string {
  return JSON.stringify(Object.keys(value).sort().map((k) => [k, value[k]]));
}

function extractProviderMessageId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  for (const key of ["messageId", "zaapId", "id"]) {
    if (typeof r[key] === "string" && r[key]) return r[key] as string;
  }
  return null;
}

export interface ScheduleRideReceiptFollowUpInput {
  connectionId: string;
  to: string;
  details: Record<string, string>;
  /** `SendMessageResult.raw` do recibo — só pra guardar o messageId. */
  receiptRaw?: unknown;
}

/**
 * Chamado logo depois que um recibo de corrida (`corrida_concluida` ou a
 * função `corrida_mai_drive`, ver isRideReceiptNotificationType) saiu com sucesso.
 * Só agenda se a conexão tiver a imagem pós-corrida ligada e completa
 * (imagem + link); caso contrário não faz nada. O envio de verdade acontece
 * no cron (dispatchDueRideReceiptFollowUps), entre 3 e 5 minutos depois.
 * Idempotente por recibo: o mesmo recibo reenviado pelo MAI Drive (mesma
 * conexão + telefone + dados) não agenda a imagem de novo.
 *
 * `active` diz se a imagem pós-corrida está ligada e completa nesta conexão
 * (mesmo quando não agendou por ser recibo repetido) — sendPurchaseConfirmation
 * usa isso pra NÃO enfileirar também uma Publicidade depois do mesmo recibo.
 */
export async function scheduleRideReceiptFollowUp(
  input: ScheduleRideReceiptFollowUpInput
): Promise<{ active: boolean; scheduled: boolean; scheduledAt?: Date }> {
  const settings = await getAppPromoSettings(input.connectionId);
  if (!settings?.enabled || !settings.imageUrl || !settings.playStoreUrl) return { active: false, scheduled: false };

  const idempotencyKey = createHash("sha256")
    .update(`${input.connectionId}|${input.to}|${stableStringify(input.details)}`)
    .digest("hex");
  const scheduledAt = new Date(Date.now() + randomAppPromoDelayMs());

  const created = await createRideReceiptFollowUpIfAbsent({
    connectionId: input.connectionId,
    toPhone: input.to,
    idempotencyKey,
    scheduledAt,
    receiptMessageId: extractProviderMessageId(input.receiptRaw),
  });
  return created ? { active: true, scheduled: true, scheduledAt } : { active: true, scheduled: false };
}

// ---------------------------------------------------------------------
// Envio (cron)
// ---------------------------------------------------------------------

export interface RideFollowUpDispatchSummary {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
}

/**
 * Tick do cron — chamado por /api/cron/ride-follow-ups e também a cada hit
 * de /api/cron/campaign-dispatcher (o pinger externo que já roda ~1x/min).
 * Stateless e idempotente: tudo que importa está em RideReceiptFollowUp,
 * então chamar duas vezes seguidas ou perder um tick é sempre seguro.
 */
export async function dispatchDueRideReceiptFollowUps(): Promise<RideFollowUpDispatchSummary> {
  const now = new Date();
  await recoverStuckRideReceiptFollowUps(new Date(now.getTime() - STUCK_THRESHOLD_MS));

  const claimed = await claimDueRideReceiptFollowUps(now, CLAIM_LIMIT_PER_TICK);
  const summary: RideFollowUpDispatchSummary = { claimed: claimed.length, sent: 0, retried: 0, failed: 0, cancelled: 0 };

  for (const item of claimed) {
    try {
      await processFollowUp(item, now, summary);
    } catch (err) {
      await logBotEvent("error", "ride_follow_up_uncaught", { followUpId: item.id, error: serializeError(err) });
      await retryOrFail(item, now, "Erro inesperado ao processar o envio.", summary).catch(() => undefined);
    }
  }

  return summary;
}

async function retryOrFail(
  item: ClaimedRideReceiptFollowUp,
  now: Date,
  error: string,
  summary: RideFollowUpDispatchSummary
) {
  if (item.attempts >= MAX_ATTEMPTS) {
    await markRideReceiptFollowUpFailed(item.id, error);
    summary.failed++;
  } else {
    await rescheduleRideReceiptFollowUp(item.id, new Date(now.getTime() + RETRY_DELAY_MS), error);
    summary.retried++;
  }
}

async function processFollowUp(item: ClaimedRideReceiptFollowUp, now: Date, summary: RideFollowUpDispatchSummary) {
  const { connection } = item;
  const settings = connection.appPromoSettings;

  if (!settings?.enabled || !settings.imageUrl || !settings.playStoreUrl) {
    await markRideReceiptFollowUpCancelled(item.id, "Imagem pós-corrida desligada ou incompleta na hora do envio.");
    summary.cancelled++;
    return;
  }
  if (now.getTime() - item.scheduledAt.getTime() > EXPIRE_AFTER_MS) {
    await markRideReceiptFollowUpCancelled(item.id, "Expirado: o cron não rodou a tempo (mais de 1h de atraso).");
    summary.cancelled++;
    return;
  }
  if (connection.status !== "CONNECTED" || !connection.apiUrl || !connection.apiTokenCipher) {
    await retryOrFail(item, now, "Conexão não está ativa/configurada no momento.", summary);
    return;
  }

  const businessName =
    connection.businessName || connection.organization.messageBusinessName || connection.organization.name;
  // Link curto próprio (/l/<slug>) quando configurado; senão o da Play Store.
  const link = settings.shortLinkUrl || settings.playStoreUrl;

  const provider = getWhatsappProvider(connection.provider.key);
  const config = {
    apiUrl: connection.apiUrl,
    apiToken: decryptSecret(connection.apiTokenCipher),
    phoneNumber: connection.phoneNumber,
  };

  // 1/2 — imagem com legenda curta, SEM link. Numa retentativa em que a
  // imagem já saiu (imageSentAt), pula direto pra 2ª parte.
  if (!item.imageSentAt) {
    const caption = renderAppPromoImageCaption(settings.caption, { businessName, link });
    const imageResult = await provider.sendImage(config, item.toPhone, settings.imageUrl, caption);
    if (!imageResult.ok) {
      await logBotEvent("warn", "ride_follow_up_send_failed", {
        followUpId: item.id,
        connectionId: connection.id,
        attempts: item.attempts,
        part: "image",
        message: imageResult.message,
      });
      await retryOrFail(item, now, imageResult.message, summary);
      return;
    }
    await markRideReceiptFollowUpImageSent(item.id, new Date(), imageResult.messageId ?? null);
    await new Promise((resolve) => setTimeout(resolve, randomAppPromoLinkGapMs()));
  }

  // 2/2 — convite + link da Play Store com prévia (send-link). Sem
  // send-link no provedor, texto comum (o WhatsApp monta a prévia sozinho).
  const message = renderAppPromoLinkMessage(settings.linkMessage, { link, businessName });
  const linkResult = provider.sendLink
    ? await provider.sendLink(config, item.toPhone, {
        message,
        linkUrl: link,
        title: renderAppPromoLinkTitle(settings.linkTitle, businessName),
        description: renderAppPromoLinkDescription(settings.linkDescription, businessName),
        image: settings.linkImageUrl || settings.imageUrl,
      })
    : await provider.sendMessage(config, item.toPhone, message);
  if (linkResult.ok) {
    await markRideReceiptFollowUpSent(item.id, new Date(), linkResult.messageId ?? null);
    summary.sent++;
    return;
  }

  await logBotEvent("warn", "ride_follow_up_send_failed", {
    followUpId: item.id,
    connectionId: connection.id,
    attempts: item.attempts,
    part: "link",
    message: linkResult.message,
  });
  await retryOrFail(item, now, linkResult.message, summary);
}

// ---------------------------------------------------------------------
// Configuração no painel (modulos/whatsapp/funcoes)
// ---------------------------------------------------------------------

function normalizeHttpsUrl(value: string | null | undefined, fieldLabel: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ValidationError(`${fieldLabel}: URL inválida.`);
  }
  if (url.protocol !== "https:") throw new ValidationError(`${fieldLabel}: use um endereço https://.`);
  return url.toString();
}

async function assertConnectionOfTenant(tenantId: string, connectionId: string) {
  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão não encontrada.");
  return summary;
}

export interface UpdateAppPromoSettingsInput {
  enabled: boolean;
  imageUrl?: string | null;
  playStoreUrl?: string | null;
  caption?: string | null;
  linkMessage?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  linkImageUrl?: string | null;
  /** Slug do link curto (/l/<slug>) usado na 2ª mensagem; vazio = link longo. */
  shortLinkSlug?: string | null;
  /** Domínio público pra montar a URL curta (a action passa o do painel). */
  publicOrigin?: string | null;
}

export async function updateAppPromoSettingsForConnection(
  tenantId: string,
  connectionId: string,
  input: UpdateAppPromoSettingsInput
) {
  const connectionSummary = await assertConnectionOfTenant(tenantId, connectionId);

  const imageUrl = normalizeHttpsUrl(input.imageUrl, "Imagem");
  const playStoreUrl = normalizeHttpsUrl(input.playStoreUrl, "Link da Play Store");
  const caption = input.caption?.trim() || null;
  if (caption && caption.length > APP_PROMO_CAPTION_MAX_LENGTH) {
    throw new ValidationError(`A legenda pode ter no máximo ${APP_PROMO_CAPTION_MAX_LENGTH} caracteres.`);
  }
  const linkMessage = input.linkMessage?.trim() || null;
  if (linkMessage && linkMessage.length > APP_PROMO_CAPTION_MAX_LENGTH) {
    throw new ValidationError(`O texto do link pode ter no máximo ${APP_PROMO_CAPTION_MAX_LENGTH} caracteres.`);
  }
  const linkTitle = input.linkTitle?.trim() || null;
  if (linkTitle && linkTitle.length > APP_PROMO_LINK_TITLE_MAX_LENGTH) {
    throw new ValidationError(`O título da prévia pode ter no máximo ${APP_PROMO_LINK_TITLE_MAX_LENGTH} caracteres.`);
  }
  const linkDescription = input.linkDescription?.trim() || null;
  if (linkDescription && linkDescription.length > APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(
      `A descrição da prévia pode ter no máximo ${APP_PROMO_LINK_DESCRIPTION_MAX_LENGTH} caracteres.`
    );
  }
  const linkImageUrl = normalizeHttpsUrl(input.linkImageUrl, "Miniatura da prévia");
  if (input.enabled && (!imageUrl || !playStoreUrl)) {
    throw new ValidationError("Pra ligar o envio, informe a imagem e o link da Play Store.");
  }

  const shortLinkSlug = validateSlugOrThrow(input.shortLinkSlug);
  let shortLinkUrl: string | null = null;
  if (shortLinkSlug) {
    if (!playStoreUrl) throw new ValidationError("Pra usar o link curto, informe o link da Play Store.");
    const origin = input.publicOrigin?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!origin) throw new ValidationError("Não deu pra descobrir o domínio do link curto.");
    const names = await getTenantMessageNames(tenantId);
    const businessName =
      connectionSummary.businessName || names?.messageBusinessName || names?.name || "";
    await ensureShortLinkForTenant(
      tenantId,
      shortLinkSlug,
      {
        targetUrl: playStoreUrl,
        title: renderAppPromoLinkTitle(linkTitle, businessName),
        description: renderAppPromoLinkDescription(linkDescription, businessName),
        imageUrl: linkImageUrl || imageUrl,
      },
      connectionId
    );
    shortLinkUrl = buildShortLinkUrl(origin, shortLinkSlug);
  }

  const saved = await upsertAppPromoSettings(connectionId, {
    enabled: input.enabled,
    imageUrl,
    playStoreUrl,
    caption,
    linkMessage,
    linkTitle,
    linkDescription,
    linkImageUrl,
    shortLinkSlug,
    shortLinkUrl,
  });
  return {
    enabled: saved.enabled,
    imageUrl: saved.imageUrl,
    playStoreUrl: saved.playStoreUrl,
    caption: saved.caption,
    linkMessage: saved.linkMessage,
    linkTitle: saved.linkTitle,
    linkDescription: saved.linkDescription,
    linkImageUrl: saved.linkImageUrl,
    shortLinkSlug: saved.shortLinkSlug,
    shortLinkUrl: saved.shortLinkUrl,
  };
}

/** Sobe a imagem pro Vercel Blob (mesmo padrão do PDF de formulário em
 * form-submission.service.ts) e devolve a URL pública. Não salva a config —
 * o painel preenche o campo e o tenant clica em Salvar. */
export async function uploadAppPromoImage(tenantId: string, connectionId: string, file: File): Promise<string> {
  await assertConnectionOfTenant(tenantId, connectionId);

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) throw new ValidationError("Formato não suportado — use JPG, PNG ou WEBP.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Imagem muito grande (máximo 1 MB).");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ValidationError(
      "Upload de imagem indisponível neste ambiente (BLOB_READ_WRITE_TOKEN não configurado) — cole a URL pública da imagem."
    );
  }

  const blob = await put(`app-promo/${connectionId}/imagem.${ext}`, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
  });
  return blob.url;
}
