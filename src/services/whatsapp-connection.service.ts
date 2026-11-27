import QRCode from "qrcode";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { generateApiKey, hashApiKey } from "@/lib/whatsapp/api-key";
import { generateWebhookSecret } from "@/lib/whatsapp/webhook-secret";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import {
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_TYPE,
  isValidNotificationTypeKey,
  buildGreeting,
  type NotificationDetails,
} from "@/config/whatsapp-notification-types";
import { isValidServiceKey } from "@/config/whatsapp-services";
import {
  getCustomNotificationTypeByKey,
  isCustomNotificationTypeKeyTaken,
  type CustomNotificationField,
} from "@/repositories/custom-notification-type.repository";
import { renderCustomMessageTemplate } from "@/services/custom-notification-type.service";
import { resolveLinkButtons } from "@/lib/notifications/custom-link-buttons";
import { sendTextWithLinkButtons } from "@/lib/whatsapp/send-with-link-buttons";
import {
  onWebhookForAdvertisements,
  scheduleAdvertisementAfterNotification,
} from "@/services/advertisement-schedule.service";
import { extractMessageId } from "@/lib/whatsapp/send-message-plan";
import { computeReceiptDedupKey } from "@/lib/notifications/receipt-dedup";
import {
  claimNotificationDedup,
  markNotificationDedupSent,
  releaseNotificationDedup,
} from "@/repositories/notification-dedup.repository";
import type {
  QrCodeResult,
  SendMessageResult,
  TestConnectionResult,
  WhatsappConnectionConfig,
} from "@/lib/whatsapp/types";
import {
  ensureChannel,
  createPendingConnection,
  createWebhookEvent,
  getConnectionSummary,
  getConnectionWithSecret,
  getConnectionByApiKeyHash,
  getConnectionCredentialsById,
  setConnectionApiKey,
  setWebhookSecret,
  revokeConnectionApiKey,
  touchApiKeyLastUsed,
  updateBalanceAlertPhones,
  updateConnectionMeta,
  updateConnectionStatus,
  updateEnabledServices,
  updateEnabledNotificationTypes,
  updateConnectionStatusById,
  updateConnectionPresenceTrackingFlag,
  type ChannelConnectionSummary,
} from "@/repositories/channel-connection.repository";
import { getProviderByKey } from "@/repositories/channel-provider.repository";
import { upsertContactPresence, getContactPresence } from "@/repositories/contact-presence.repository";
import { handleInboundMessage } from "./bot-attendant.service";
import { tryClaimInboundMessage } from "@/repositories/bot.repository";
import { tryHandleRelayMessage } from "@/services/relay-session.service";
import { isRideReceiptNotificationType } from "@/config/ride-receipt-app-promo";
import {
  planPostNotificationPromotions,
  resolveRideRequestSource,
  rideAllowsPromotions,
} from "@/lib/notifications/ride-request-source";
import {
  scheduleInlineRideFollowUpDispatch,
  scheduleRideReceiptFollowUp,
  tickRideFollowUpsOpportunistically,
} from "@/services/ride-receipt-follow-up.service";
import {
  applyCampaignMessageStatus,
  rememberInboundContactName,
  tryHandleCampaignOptOut,
} from "@/services/campaign-inbound.service";
import { tryHandleFlowMessage } from "@/services/flow-engine.service";
import { interceptAutomaticReply } from "@/services/anti-loop.service";
import { interceptAckReplyAfterNotification, recordNotificationSent } from "@/services/ack-silence.service";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/server/errors";

const WHATSAPP_MODULE_KEY = "whatsapp";
const DEFAULT_PROVIDER_KEY = "z-api"; // only active provider today — see ChannelProvider seed

/** Tests provider credentials without touching the database — used by the
 * admin's "Testar e salvar" action (see provisionConnection). */
export async function testConnection(
  providerKey: string,
  config: WhatsappConnectionConfig
): Promise<TestConnectionResult> {
  const provider = getWhatsappProvider(providerKey);
  return provider.testConnection(config);
}

export interface RequestConnectionInput {
  productKeys: string[];
  phoneNumber: string;
}

/**
 * Tenant-facing: records a connection *request* (product(s) + phone
 * number) with no credentials — a platform admin fills those in later via
 * `provisionConnection`. Does NOT mark the module as installed; that only
 * happens once the connection is actually provisioned and working.
 */
export async function requestConnection(
  tenantId: string,
  input: RequestConnectionInput
): Promise<ChannelConnectionSummary> {
  const selectedProducts = WHATSAPP_PRODUCTS.filter(
    (p) => input.productKeys.includes(p.key) && p.available
  );
  if (selectedProducts.length === 0) {
    throw new ValidationError("Selecione ao menos um produto disponível.");
  }
  if (!input.phoneNumber.trim()) {
    throw new ValidationError("Informe o número do WhatsApp.");
  }

  const provider = await getProviderByKey(DEFAULT_PROVIDER_KEY);
  if (!provider) throw new NotFoundError("Provedor padrão não configurado.");

  const channel = await ensureChannel(tenantId, "WHATSAPP");

  const connection = await createPendingConnection({
    tenantId,
    channelId: channel.id,
    providerId: provider.id,
    connectionName: selectedProducts.map((p) => p.name).join(", "),
    phoneNumber: input.phoneNumber,
  });

  const summary = await getConnectionSummary(tenantId, connection.id);
  if (!summary) throw new NotFoundError("Solicitação criada, mas não encontrada ao recarregar.");
  return summary;
}

export interface UpdateConnectionMetaInput {
  connectionName: string;
  phoneNumber: string;
  businessName: string | null;
}

/** Tenant-facing: renames the connection and/or corrects the phone number
 * shown for it. Deliberately does NOT touch apiUrl/apiTokenCipher — those
 * are provisioned only by a platform admin (see provisionConnection); if
 * the credentials themselves are wrong, the fix is a new connection
 * request, not an edit. */
export async function updateConnectionMetadata(
  tenantId: string,
  connectionId: string,
  input: UpdateConnectionMetaInput
): Promise<ChannelConnectionSummary> {
  if (!input.connectionName.trim()) throw new ValidationError("Informe o nome da conexão.");
  if (!input.phoneNumber.trim()) throw new ValidationError("Informe o número do WhatsApp.");

  const result = await updateConnectionMeta(tenantId, connectionId, {
    connectionName: input.connectionName.trim(),
    phoneNumber: input.phoneNumber.trim(),
    businessName: input.businessName?.trim() || null,
  });
  if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

const PHONE_DIGITS_ONLY = /^\d{10,}$/;

/** Tenant-facing: sets the up-to-3 fixed phone numbers that receive the
 * balance-alert message (see sendBalanceAlert) — a deliberately small,
 * hand-curated list, never numbers supplied by the external caller that
 * triggers the alert. */
export async function updateConnectionBalanceAlertPhones(
  tenantId: string,
  connectionId: string,
  phones: string[]
): Promise<ChannelConnectionSummary> {
  const cleaned = phones.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length > 3) {
    throw new ValidationError("No máximo 3 números para receber o alerta de saldo baixo.");
  }
  const invalid = cleaned.find((p) => !PHONE_DIGITS_ONLY.test(p));
  if (invalid) {
    throw new ValidationError(
      `Número inválido: "${invalid}". Use só dígitos, DDI + DDD + número (ex: 5511999999999).`
    );
  }

  const result = await updateBalanceAlertPhones(tenantId, connectionId, cleaned);
  if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

/** Tenant-facing: sets which services (config/whatsapp-services.ts) this
 * connection's API key is allowed to call — enforced by each service
 * function below (sendPurchaseConfirmation / sendBalanceAlert), not by the
 * auth layer itself, since it's a per-connection business rule rather than
 * an auth concern. Doesn't require at least one service checked — a
 * tenant temporarily disabling everything is a valid state, just means the
 * key can't call anything until re-enabled. */
export async function updateConnectionEnabledServices(
  tenantId: string,
  connectionId: string,
  services: string[]
): Promise<ChannelConnectionSummary> {
  const cleaned = [...new Set(services)];
  const invalid = cleaned.find((s) => !isValidServiceKey(s));
  if (invalid) {
    throw new ValidationError(`Serviço desconhecido: "${invalid}".`);
  }

  const result = await updateEnabledServices(tenantId, connectionId, cleaned);
  if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

/** Tenant-facing: sets which notification types (config/whatsapp-notification-types.ts)
 * this connection's API key is allowed to send — enforced in
 * sendPurchaseConfirmation. Mesmo padrão de updateConnectionEnabledServices,
 * só que no nível de granularidade do tipo em vez do serviceKey amplo. */
export async function updateConnectionEnabledNotificationTypes(
  tenantId: string,
  connectionId: string,
  types: string[]
): Promise<ChannelConnectionSummary> {
  const cleaned = [...new Set(types)];
  // Aceita tanto o catálogo fixo quanto funções personalizadas dessa
  // conexão (ver CustomNotificationType) — um tipo só é inválido se não
  // for nenhum dos dois.
  const unknown = cleaned.filter((t) => !isValidNotificationTypeKey(t));
  for (const key of unknown) {
    if (!(await isCustomNotificationTypeKeyTaken(connectionId, key))) {
      throw new ValidationError(`Tipo de notificação desconhecido: "${key}".`);
    }
  }

  const result = await updateEnabledNotificationTypes(tenantId, connectionId, cleaned);
  if (result.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

export interface ProvisionConnectionInput {
  apiUrl: string;
  apiToken: string;
}

/** Statuses that mean "credentials are actually good" — either fully
 * paired already, or just waiting on the tenant to scan the QR code (which
 * still proves the instance/Client-Token are valid). Anything else
 * (INVALID_TOKEN, UNAVAILABLE, ERROR, AUTH_ERROR) means the credentials
 * themselves are wrong and nothing should be persisted. */
function isProvisionable(
  status: TestConnectionResult["status"]
): status is "CONNECTED" | "AWAITING_QR_SCAN" {
  return status === "CONNECTED" || status === "AWAITING_QR_SCAN";
}

/**
 * Admin-facing: fills in the real Z-API credentials for an existing
 * PENDING connection request. Re-validates server-side before persisting
 * (never trusts anything blindly) and marks the WhatsApp module INSTALLED
 * for that tenant as soon as the credentials check out — even if the
 * WhatsApp session itself still needs the tenant to scan a QR code (see
 * AWAITING_QR_SCAN / getConnectionQrCode), since that step can only be
 * done by whoever has the phone, never by the admin provisioning this.
 * Throws (without writing anything) if the credentials themselves are bad
 * — the connection stays PENDING so the admin can fix and retry.
 */
export async function provisionConnection(
  tenantId: string,
  connectionId: string,
  input: ProvisionConnectionInput
): Promise<ChannelConnectionSummary> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const provider = getWhatsappProvider(connection.provider.key);
  const testResult = await provider.testConnection({
    apiUrl: input.apiUrl,
    apiToken: input.apiToken,
    phoneNumber: connection.phoneNumber,
  });

  if (!isProvisionable(testResult.status)) {
    throw new ValidationError(testResult.message, { status: testResult.status });
  }

  const apiTokenCipher = encryptSecret(input.apiToken);

  await prisma.$transaction(async (tx) => {
    await tx.channelConnection.updateMany({
      where: { id: connectionId, tenantId },
      data: {
        apiUrl: input.apiUrl,
        apiTokenCipher,
        status: testResult.status,
        lastValidation: new Date(),
        lastError: testResult.ok ? null : testResult.message,
      },
    });

    const whatsappModule = await tx.module.findUnique({ where: { key: WHATSAPP_MODULE_KEY } });
    if (whatsappModule) {
      await tx.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId: whatsappModule.id } },
        create: {
          tenantId,
          moduleId: whatsappModule.id,
          status: "INSTALLED",
          installedAt: new Date(),
        },
        update: { status: "INSTALLED", installedAt: new Date() },
      });
    }
  });

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão provisionada, mas não encontrada ao recarregar.");
  return summary;
}

/** Fetches the QR code the tenant scans (with the phone that owns the
 * number) to finish pairing — only meaningful once credentials are set. */
export async function getConnectionQrCode(
  tenantId: string,
  connectionId: string
): Promise<QrCodeResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  return provider.getQrCode({
    apiUrl: connection.apiUrl,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });
}

export async function sendTestMessage(
  tenantId: string,
  connectionId: string,
  to: string,
  text: string
): Promise<SendMessageResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  return provider.sendMessage(
    { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber },
    to,
    text
  );
}

/** Re-runs the test against a saved connection's stored credentials and
 * updates its status/lastValidation/lastError to match the fresh result. */
export async function retestConnection(
  tenantId: string,
  connectionId: string
): Promise<TestConnectionResult> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const result = await provider.testConnection({
    apiUrl: connection.apiUrl,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });

  // Enquanto conectado, consulta qual número está realmente pareado agora
  // e mantém o campo em dia sozinho — sem isso, re-parear um aparelho
  // diferente deixaria o número salvo (e tudo que depende dele, como a
  // extração de contatos) referenciando o aparelho antigo até alguém
  // editar manualmente. Best-effort: uma falha aqui nunca derruba o
  // resultado do teste em si.
  let phoneNumber: string | undefined;
  if (result.status === "CONNECTED") {
    const device = await provider.getConnectedPhone({
      apiUrl: connection.apiUrl,
      apiToken,
      phoneNumber: connection.phoneNumber,
    });
    if (device.ok && device.phone && device.phone !== connection.phoneNumber) {
      phoneNumber = device.phone;
    }
  }

  await updateConnectionStatus(tenantId, connectionId, {
    status: result.status,
    lastValidation: new Date(),
    lastError: result.ok ? null : result.message,
    ...(phoneNumber ? { phoneNumber } : {}),
  });

  return result;
}

// --- API key (machine-to-machine auth) -----------------------------------

/** Generates a fresh API key for a connection, replacing any previous one.
 * Returns the plaintext key — the ONLY time it is ever available; only its
 * hash is persisted (see lib/whatsapp/api-key.ts). */
export async function rotateApiKey(tenantId: string, connectionId: string): Promise<string> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const { plaintext, hash, prefix } = generateApiKey();
  await setConnectionApiKey(tenantId, connectionId, { apiKeyHash: hash, apiKeyPrefix: prefix });
  return plaintext;
}

export async function revokeApiKey(tenantId: string, connectionId: string): Promise<void> {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  await revokeConnectionApiKey(tenantId, connectionId);
}

// --- Webhooks (inbound, from the provider) ----------------------------------

/** Generates the connection's webhook secret the first time it's needed
 * (idempotent — returns the existing one on later calls instead of
 * rotating it, since rotating would require re-registering the URL with
 * the provider every time). Returns the full URL to register in the
 * provider's dashboard/API, secret embedded as a query param. */
export async function ensureWebhookUrl(tenantId: string, connectionId: string): Promise<string> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  let secret = connection.webhookSecret;
  if (!secret) {
    secret = generateWebhookSecret();
    await setWebhookSecret(tenantId, connectionId, secret);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new ConflictError("NEXT_PUBLIC_APP_URL não configurada.");
  return `${baseUrl}/api/webhooks/zapi/${connectionId}?secret=${secret}`;
}

/**
 * Tenant-facing: liga/desliga o rastreamento de presença (online/digitando/
 * gravando áudio) desta conexão. Opt-in e desligado por padrão — a própria
 * Z-API recomenda não deixar isso ligado pra toda conexão (throttling/
 * custo), e o dado só chega mesmo se o contato não tiver desativado "visto
 * por último"/online no WhatsApp dele.
 *
 * Ligar registra a MESMA URL de webhook usada pra todo o resto
 * (ensureWebhookUrl — ela já multiplexa por `type` dentro de
 * recordWebhookEvent, nenhuma rota nova precisa existir) como o
 * `update-webhook-chat-presence` da instância Z-API; desligar limpa esse
 * campo na instância (`value: ""`) e apaga o flag local. Lança se a
 * conexão não tiver credenciais ainda, ou se o provider não suportar o
 * recurso; uma falha da CHAMADA ao desligar é só logada (nunca bloqueia o
 * tenant de desligar o que já pediu pra desligar).
 */
export async function setPresenceTrackingEnabled(
  tenantId: string,
  connectionId: string,
  enabled: boolean
): Promise<ChannelConnectionSummary> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const provider = getWhatsappProvider(connection.provider.key);
  if (!provider.updateChatPresenceWebhook) {
    throw new ValidationError("Este provedor não suporta rastreamento de presença.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const config = { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber };

  if (enabled) {
    const webhookUrl = await ensureWebhookUrl(tenantId, connectionId);
    const result = await provider.updateChatPresenceWebhook(config, webhookUrl);
    if (!result.ok) {
      throw new ConflictError(`Não foi possível ativar o rastreamento de presença: ${result.message}`);
    }
  } else {
    const result = await provider.updateChatPresenceWebhook(config, "");
    if (!result.ok) {
      await logBotEvent("warn", "presence_webhook_clear_failed", { connectionId, error: result.message });
    }
  }

  const updateResult = await updateConnectionPresenceTrackingFlag(tenantId, connectionId, enabled);
  if (updateResult.count === 0) throw new NotFoundError("Conexão não encontrada.");

  const summary = await getConnectionSummary(tenantId, connectionId);
  if (!summary) throw new NotFoundError("Conexão atualizada, mas não encontrada ao recarregar.");
  return summary;
}

/** Tenant-facing: último status de presença conhecido (online/digitando/
 * gravando áudio/offline) de um telefone nesta conexão — `null` quando
 * nunca chegou nenhum evento pra esse número (rastreamento desligado,
 * contato com privacidade restrita no WhatsApp, ou nunca trocou mensagem
 * com essa instância). Verifica a posse da conexão (tenantId) antes de
 * consultar — a leitura em si não exige presenceTrackingEnabled=true
 * (desligar não apaga o histórico já guardado, só para de atualizar). */
export async function getContactPresenceStatus(
  tenantId: string,
  connectionId: string,
  phone: string
) {
  const connection = await getConnectionSummary(tenantId, connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");
  return getContactPresence(connectionId, phone);
}

/** Z-API's own event-name convention, confirmed for real against the
 * trial instance for "MessageStatusCallback" (see WebhookEvent rows).
 * "ConnectedCallback"/"DisconnectedCallback" follow the same naming
 * pattern but are NOT yet confirmed against a real event — forcing a real
 * disconnect just to verify would mean actually unpairing the production
 * WhatsApp session, too disruptive to do just for this. If the real
 * webhook turns out to use a different type string, this silently does
 * nothing (the raw payload is still logged either way) until corrected. */
const CONNECTED_EVENT_TYPE = "ConnectedCallback";
const DISCONNECTED_EVENT_TYPE = "DisconnectedCallback";
/** Z-API's type for an inbound WhatsApp message — confirmed for real via
 * the AI attendant's first live test (text and voice messages both landed
 * with this type). Shape for text: `{ phone, fromMe, isGroup, text: {
 * message } }`; for a voice message: `{ phone, fromMe, isGroup, audio: {
 * audioUrl, mimeType } }` — audioUrl is a public Backblaze B2 temp URL, no
 * auth needed to download (see transcribeAudio in bot-attendant.service.ts
 * for why its Content-Type still needs normalizing before Whisper). */
const MESSAGE_RECEIVED_EVENT_TYPE = "ReceivedCallback";
/** Z-API's type for a chat-presence event (contact online/typing/recording
 * — see developer.z-api.io/webhooks/on-chat-presence), confirmed against
 * the docs' example payloads. Only arrives for connections that opted in
 * via setPresenceTrackingEnabled below, which registers this instance's
 * `update-webhook-chat-presence` URL — pointed at the SAME webhook route as
 * every other event type (no separate endpoint), same multiplexing as
 * CONNECTED_EVENT_TYPE/MESSAGE_RECEIVED_EVENT_TYPE above. */
const PRESENCE_EVENT_TYPE = "PresenceChatCallback";
/** Status values Z-API sends on a PresenceChatCallback — kept as a const
 * array (not a schema enum) so an unrecognized future value from Z-API
 * still gets stored as-is instead of failing the upsert. */
const KNOWN_PRESENCE_STATUSES = ["AVAILABLE", "UNAVAILABLE", "COMPOSING", "PAUSED", "RECORDING"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Best-effort: the real paired phone, if different from what's stored —
 * or undefined on any failure/no-change, so the caller can just spread it
 * in conditionally instead of branching. No tenantId available on this
 * path (webhook), hence getConnectionCredentialsById instead of the
 * tenant-scoped getConnectionWithSecret. */
async function detectConnectedPhone(connectionId: string): Promise<string | undefined> {
  const connection = await getConnectionCredentialsById(connectionId);
  if (!connection?.apiUrl || !connection.apiTokenCipher) return undefined;

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const device = await provider.getConnectedPhone({
    apiUrl: connection.apiUrl,
    apiToken,
    phoneNumber: connection.phoneNumber,
  });

  return device.ok && device.phone && device.phone !== connection.phoneNumber ? device.phone : undefined;
}

/** Flips the connection's status in near-real-time when Z-API tells us the
 * WhatsApp session connected/disconnected — instead of only finding out
 * whenever a human happens to click "Testar novamente". Deliberately
 * separate from testConnection/retestConnection's HTTP-poll path; this is
 * push-driven. AWAITING_QR_SCAN (not ERROR/UNAVAILABLE) on disconnect,
 * since re-pairing via QR code is the actual fix, not a broken credential. */
async function applyConnectionStatusFromWebhook(
  connectionId: string,
  payload: unknown
): Promise<void> {
  if (!isRecord(payload)) return;
  const type = payload.type;

  if (type === CONNECTED_EVENT_TYPE) {
    // Mesma lógica de auto-detecção do retestConnection, só que disparada
    // pelo push do webhook em vez do poll manual — sem isso, reconectar um
    // aparelho diferente só corrigiria o número salvo na próxima vez que
    // alguém clicasse "Testar novamente".
    const phoneNumber = await detectConnectedPhone(connectionId);
    await updateConnectionStatusById(connectionId, {
      status: "CONNECTED",
      lastValidation: new Date(),
      lastError: null,
      ...(phoneNumber ? { phoneNumber } : {}),
    });
  } else if (type === DISCONNECTED_EVENT_TYPE) {
    await updateConnectionStatusById(connectionId, {
      status: "AWAITING_QR_SCAN",
      lastValidation: new Date(),
      lastError: "Sessão desconectada — detectado via webhook, escaneie o QR code novamente.",
    });
  }
}

/** Upserts the latest known presence for a contact whenever a
 * PresenceChatCallback lands — no-op for any other event type. Never
 * throws (same convention as the rest of this webhook path): a malformed
 * payload (missing phone/status) is just ignored, the raw event is still
 * logged by createWebhookEvent either way. Doesn't check
 * `presenceTrackingEnabled` here — if Z-API is sending this event at all,
 * it's because the connection asked for it via setPresenceTrackingEnabled,
 * so trusting the event itself is enough; re-checking the flag would just
 * create a window where a race with disabling drops a still-in-flight
 * event for no real benefit. */
async function applyPresenceFromWebhook(connectionId: string, payload: unknown): Promise<void> {
  if (!isRecord(payload) || payload.type !== PRESENCE_EVENT_TYPE) return;

  const phone = payload.phone;
  const status = payload.status;
  if (typeof phone !== "string" || !phone.trim() || typeof status !== "string" || !status.trim()) return;

  const lastSeenRaw = payload.lastSeen;
  // Z-API docs show `lastSeen` as a Unix timestamp (seconds) or null in
  // every example payload seen so far — never confirmed non-null against a
  // real instance yet, so this defensively accepts either seconds or
  // milliseconds (a seconds value would otherwise land in 1970).
  const lastSeen =
    typeof lastSeenRaw === "number" && lastSeenRaw > 0
      ? new Date(lastSeenRaw < 1e12 ? lastSeenRaw * 1000 : lastSeenRaw)
      : null;

  if (!KNOWN_PRESENCE_STATUSES.includes(status as (typeof KNOWN_PRESENCE_STATUSES)[number])) {
    await logBotEvent("info", "presence_unknown_status", { connectionId, phone, status });
  }

  await upsertContactPresence(connectionId, phone, { status, lastSeen });
}

/** Hands an inbound text message to the AI attendant (see
 * bot-attendant.service.ts) — the bot itself decides whether to respond
 * (checks BotConfig.enabled). Ignores messages the connected number sent
 * itself (fromMe) and group messages (isGroup) — this first increment only
 * handles 1:1 chats. Never throws, same convention as the rest of this
 * webhook path. */
async function maybeHandleInboundBotMessage(connectionId: string, payload: unknown): Promise<void> {
  if (!isRecord(payload) || payload.type !== MESSAGE_RECEIVED_EVENT_TYPE) return;
  if (payload.fromMe === true || payload.isGroup === true) return;

  const fromPhone = payload.phone;
  if (typeof fromPhone !== "string") return;
  const chatLid = typeof payload.chatLid === "string" && payload.chatLid.trim() ? payload.chatLid.trim() : null;

  // `chatName`, não `senderName` — confirmado contra payloads reais que
  // `senderName` vem com o nome da própria conta conectada (não do
  // cliente) nessas mensagens, apesar do que a documentação da Z-API diz.
  const customerName =
    typeof payload.chatName === "string" && payload.chatName.trim() ? payload.chatName.trim() : null;

  // Z-API redelivers the same audio message's webhook a few seconds apart
  // (confirmed in production) — claim the messageId first so the second
  // delivery is a no-op instead of a second AI reply. No messageId (any
  // future payload shape that omits it) just skips the dedup, same as
  // today's unprotected behavior.
  const messageId = payload.messageId;
  if (typeof messageId === "string") {
    const claimed = await tryClaimInboundMessage(connectionId, messageId);
    if (!claimed) {
      await logBotEvent("info", "webhook_duplicate_skipped", { connectionId, fromPhone, messageId });
      return;
    }
  }

  const text = isRecord(payload.text) ? payload.text.message : undefined;
  const bodyText = typeof text === "string" && text.trim() ? text : null;

  // Nome do contato que a Z-API entrega no webhook (chatName) preenche
  // contato de campanha sem nome — ver campaign-inbound.service.ts.
  await rememberInboundContactName(connectionId, fromPhone, payload).catch(async (err) => {
    await logBotEvent("warn", "remember_inbound_contact_name_failed", { connectionId, error: serializeError(err) });
    return 0;
  });

  // Repasse humano (ver relay-session.service.ts): intercepta ANTES do bot
  // de IA qualquer mensagem de quem já está dos dois lados de um handoff em
  // andamento (cliente escalado, ou atendente com algo pendente/ativo) —
  // `true` significa "já tratei, não deixa cair no bot". Entra depois do
  // dedup acima (mensagem redelivered não deve ser relayada duas vezes) e
  // antes dos branches texto/áudio normais de baixo.
  // Opt-out de campanha ("SAIR", "PARAR"...): antes de tudo (relay, fluxo,
  // IA) — quem pediu pra sair não pode cair numa resposta automática. Só
  // intercepta quem recebeu campanha desta conexão nos últimos 30 dias (ver
  // campaign-inbound.service.ts); qualquer erro aqui não derruba o bot.
  if (bodyText) {
    const optOutHandled = await tryHandleCampaignOptOut({ connectionId, fromPhone, text: bodyText }).catch(
      async (err) => {
        await logBotEvent("error", "campaign_opt_out_failed", { connectionId, error: serializeError(err) });
        return false;
      }
    );
    if (optOutHandled) return;
  }

  const relayHandled = await tryHandleRelayMessage({
    connectionId,
    fromPhone,
    customerName,
    text: bodyText,
    chatLid,
  });
  if (relayHandled) return;

  // Proteção anti-loop (ver anti-loop.service.ts): se este contato já foi
  // identificado como robô, ou se estourou o teto de respostas por minuto,
  // não deixa cair no fluxo nem na IA. A pausa persistente reusa uma
  // RelaySession PENDING no setor interno "Pausa automática (sistema)".
  const antiLoop = await interceptAutomaticReply({
    connectionId,
    fromPhone,
    customerName,
    chatLid,
  });
  if (antiLoop.skip) return;

  // Silêncio pós-notificação (ver ack-silence.service.ts): resposta que é só
  // "obrigado"/"bom dia"/"ok"/emoji/figurinha a uma notificação automática
  // recente (6h) não abre fluxo nem IA. A mensagem continua gravada no
  // webhook_event (createWebhookEvent acima) como qualquer outra.
  const reactionValue = isRecord(payload.reaction) ? payload.reaction.value : undefined;
  const hasAudio = isRecord(payload.audio);
  const ackSilence = await interceptAckReplyAfterNotification({
    connectionId,
    fromPhone,
    text: bodyText ?? (typeof reactionValue === "string" ? reactionValue : null),
    nonTextAck: !bodyText && !hasAudio && isRecord(payload.sticker) ? "sticker" : null,
  });
  if (ackSilence.skip) return;

  // Fluxo visual (ver flow-engine.service.ts): só intercepta quando esta
  // conexão tem um Flow PUBLISHED — senão retorna "not_applicable" e cai
  // pro atendente de IA normalmente, exatamente como hoje. Entra depois do
  // relay humano (uma conversa já escalada não deve voltar pro fluxo) e
  // antes dos branches texto/áudio de handleInboundMessage. "ai_handoff"
  // significa que o fluxo chegou num nó `ai` — a IA precisa responder esta
  // mesma mensagem mesmo com BotConfig.enabled=false (normal enquanto um
  // Flow está publicado, ver publishFlow em flow.service.ts).
  const flowResult = await tryHandleFlowMessage({ connectionId, fromPhone, customerName, text: bodyText });
  if (flowResult === "handled") return;
  const bypassEnabledCheck = flowResult === "ai_handoff";

  if (bodyText) {
    await handleInboundMessage({ connectionId, fromPhone, customerName, text: bodyText, bypassEnabledCheck });
    return;
  }

  const audioUrl = isRecord(payload.audio) ? payload.audio.audioUrl : undefined;
  if (typeof audioUrl === "string" && audioUrl) {
    await handleInboundMessage({ connectionId, fromPhone, customerName, audioUrl, bypassEnabledCheck });
    return;
  }

  await logBotEvent("info", "webhook_message_received_no_content", {
    connectionId,
    fromPhone,
    messageId: typeof messageId === "string" ? messageId : null,
  });
}

/** Called by the public webhook route after verifying the secret. Always
 * persists the raw payload first (see WebhookEvent's schema comment:
 * interpreting these is still mostly future work, this is the log
 * everything else reads from) — connection-status events are applied
 * directly, see applyConnectionStatusFromWebhook. Never throws on a
 * malformed/unexpected payload shape — a webhook endpoint must always ack
 * fast.
 *
 * The bot attendant pipeline (transcription + LLM + TTS + send, chained
 * sequentially) is deliberately NOT awaited here: it used to run inline,
 * which meant the HTTP response to Z-API didn't go out until the entire
 * AI round-trip finished. In production that silently dropped at least two
 * real audio messages with zero DB trace — the same inputs replayed fine
 * locally, pointing at a platform-level kill (timeout/cold start) rather
 * than a code bug. `after()` defers it until the response is already sent,
 * using Vercel's waitUntil to keep the function alive in the background. */
export async function recordWebhookEvent(connectionId: string, payload: unknown): Promise<void> {
  await createWebhookEvent(connectionId, "z-api", payload);
  await applyConnectionStatusFromWebhook(connectionId, payload).catch((err) => {
    void logBotEvent("error", "apply_connection_status_failed", { connectionId, error: serializeError(err) });
  });
  await applyPresenceFromWebhook(connectionId, payload).catch((err) => {
    void logBotEvent("error", "apply_presence_failed", { connectionId, error: serializeError(err) });
  });
  // Publicidades: o RECEIVED de um recibo libera a publicidade da fila
  // (30 s depois, em after()). Outros eventos: não faz nada. Nunca lança.
  onWebhookForAdvertisements(connectionId, payload);
  // Rede de segurança do convite pós-corrida (sem cron externo): processa
  // convites vencidos em after(), com throttle. Nunca lança.
  tickRideFollowUpsOpportunistically();
  // Entregue / lido dos envios de campanha (MessageStatusCallback).
  await applyCampaignMessageStatus(connectionId, payload).catch((err) => {
    void logBotEvent("error", "apply_campaign_message_status_failed", { connectionId, error: serializeError(err) });
  });
  after(() =>
    maybeHandleInboundBotMessage(connectionId, payload).catch((err) => {
      void logBotEvent("error", "bot_pipeline_uncaught", { connectionId, error: serializeError(err) });
    })
  );
}

export interface PurchaseConfirmationInput {
  to: string;
  /** Notification type key from the catalog (whatsapp-notification-types.ts)
   * — e.g. "ingresso_emitido", "agendamento_confirmado". Falls back to the
   * generic "compra_confirmada" when omitted. */
  type?: string;
  /** The name registered for this person in the caller's own system —
   * never the WhatsApp profile name (see buildMessage's whatsappName). */
  recipientName: string;
  /** Type-specific data (e.g. { data, horario } for agendamento_confirmado)
   * — see each type's `requiredDetailKeys` in the catalog. */
  details?: NotificationDetails;
  /** Required when the resolved type's `requiresQr` is true (tickets,
   * vouchers — anything meant to be scanned); optional otherwise, in which
   * case the message is sent as plain text instead of a captioned image. */
  qrData?: string;
  /** Optional free-text line the caller can add on top of the templated
   * message (e.g. "Apresente esse ingresso na portaria do evento, não
   * perca") — appended as its own paragraph, after everything the catalog
   * template builds. Unlike every other field, this one *is* raw text
   * from the caller — deliberately opt-in and additive, never a
   * replacement for the structured template. */
  note?: string;
  /** Recibo de corrida: onde a corrida foi pedida ("app", "whatsapp",
   * "motorista", "macaneta"). Pedida pelo app → sem divulgação do app depois
   * do recibo. Opcional — também aceito em details.canal_pedido. Ver
   * lib/notifications/ride-request-source.ts. */
  requestSource?: string;
  /** Chave de idempotência opcional (header Idempotency-Key ou campo
   * idempotencyKey; também aceita details.id_corrida). Mesma chave em até
   * 30 min = não reenvia. Ver lib/notifications/receipt-dedup.ts. */
  idempotencyKey?: string;
}

/**
 * Entry point for external systems (e.g. an e-commerce site, a ticketing
 * platform, a booking system) triggering a WhatsApp notification via API
 * key — no tenant session involved, the key alone resolves the connection.
 * The message text is always built by us from the notification-type
 * catalog (see whatsapp-notification-types.ts) — the caller never supplies
 * free text, only structured data (`type`, `recipientName`, `details`).
 * When `qrData` is present it's rendered by us into a QR image (never
 * accepted pre-rendered from the caller — simpler contract, no dependency
 * on an external URL, no SSRF surface) and sent as a captioned image;
 * otherwise the message goes out as plain text.
 */
export async function sendPurchaseConfirmation(
  apiKeyPlaintext: string,
  input: PurchaseConfirmationInput
): Promise<SendMessageResult> {
  const connection = await getConnectionByApiKeyHash(hashApiKey(apiKeyPlaintext));
  if (!connection) throw new UnauthorizedError("Chave de API inválida.");

  // Resolve contra o catálogo fixo primeiro; se não achar, pode ser uma
  // função personalizada dessa conexão (ver CustomNotificationType) —
  // mesmo `type` desconhecido continua dando o erro de sempre se não achar
  // em nenhum dos dois.
  const resolvedKey = input.type?.trim() || DEFAULT_NOTIFICATION_TYPE;
  const builtInType = NOTIFICATION_TYPES.find((t) => t.key === resolvedKey);
  const customType = builtInType ? null : await getCustomNotificationTypeByKey(connection.id, resolvedKey);
  if (!builtInType && !customType) {
    throw new ValidationError(
      `Tipo de notificação inválido: "${resolvedKey}". Tipos disponíveis: ${NOTIFICATION_TYPES.map((t) => t.key).join(", ")}.`
    );
  }
  const label = builtInType?.label ?? customType!.label;

  if (!connection.enabledNotificationTypes.includes(resolvedKey)) {
    throw new ForbiddenError(`Este tipo de mensagem ("${label}") não está habilitado para esta conexão.`);
  }
  if (connection.status !== "CONNECTED") {
    throw new ConflictError("Esta conexão não está ativa no momento.");
  }
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão não está totalmente configurada.");
  }

  const details = input.details ?? {};
  const requiredKeys = builtInType
    ? builtInType.requiredDetailKeys
    : (customType!.fields as unknown as CustomNotificationField[])
        .filter((f) => f.required !== false)
        .map((f) => f.key);
  const missingDetails = requiredKeys.filter((key) => !details[key]?.trim());
  if (missingDetails.length > 0) {
    throw new ValidationError(`O tipo "${resolvedKey}" precisa dos dados: ${missingDetails.join(", ")}.`);
  }
  const requiresQr = builtInType?.requiresQr ?? customType!.requiresQr;
  if (requiresQr && !input.qrData) {
    throw new ValidationError(`O tipo "${resolvedKey}" exige o campo qrData.`);
  }

  // Trava contra recibo repetido: o Mai Drive chama 2x a mesma corrida
  // (4-11 s de diferença). A 2ª chamada responde 200 com duplicate:true e o
  // id da 1ª mensagem, sem reenviar. Se o envio falhar, a chave é liberada.
  const dedupKey = computeReceiptDedupKey({
    type: resolvedKey,
    to: input.to,
    details: input.details,
    note: input.note,
    qrData: input.qrData,
    explicitKey: input.idempotencyKey,
    isRideReceipt: isRideReceiptNotificationType(resolvedKey),
  });
  const dedupClaim = dedupKey ? await claimNotificationDedup(connection.id, dedupKey) : null;
  if (dedupClaim && !dedupClaim.claimed) {
    await logBotEvent("info", "notification.duplicate_skipped", {
      connectionId: connection.id,
      notificationType: resolvedKey,
      firstMessageId: dedupClaim.messageId,
      inFlight: dedupClaim.inFlight,
    });
    return {
      ok: true,
      duplicate: true,
      message: "Mensagem repetida: a mesma já foi enviada há pouco, não reenviada.",
      ...(dedupClaim.messageId ? { messageId: dedupClaim.messageId } : {}),
    };
  }
  const dedupId = dedupClaim?.claimed ? dedupClaim.id : null;
  try {
    const result = await sendPurchaseConfirmationClaimed(connection, input, {
      resolvedKey,
      builtInType,
      customType,
      details,
    });
    if (dedupId) {
      if (result.ok) await markNotificationDedupSent(dedupId, result.messageId ?? extractMessageId(result.raw) ?? null);
      else await releaseNotificationDedup(dedupId);
    }
    return result;
  } catch (err) {
    if (dedupId) await releaseNotificationDedup(dedupId).catch(() => undefined);
    throw err;
  }
}

type PurchaseConnection = NonNullable<Awaited<ReturnType<typeof getConnectionByApiKeyHash>>>;

/** O envio de fato (depois de validar e reservar a chave anti-repetição). */
async function sendPurchaseConfirmationClaimed(
  connection: PurchaseConnection,
  input: PurchaseConfirmationInput,
  resolved: {
    resolvedKey: string;
    builtInType: (typeof NOTIFICATION_TYPES)[number] | undefined;
    customType: Awaited<ReturnType<typeof getCustomNotificationTypeByKey>>;
    details: NotificationDetails;
  }
): Promise<SendMessageResult> {
  const { resolvedKey, builtInType, customType, details } = resolved;
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão não está totalmente configurada.");
  }
  await touchApiKeyLastUsed(connection.id);

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const config = { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber };

  // Best-effort — a failed/empty/slow lookup never blocks the send; the
  // greeting then uses the client-provided name or a generic "Olá!" /
  // "Bom dia!". Short timeout so a hanging Z-API contact lookup doesn't
  // delay the message (the provider's own fetch timeout is longer).
  const CONTACT_NAME_TIMEOUT_MS = 3_000;
  const contactName = await Promise.race([
    provider.getContactName(config, input.to).catch(() => ({ ok: false as const })),
    new Promise<{ ok: false }>((resolve) => {
      setTimeout(() => resolve({ ok: false as const }), CONTACT_NAME_TIMEOUT_MS);
    }),
  ]);
  const whatsappName = contactName.ok ? contactName.name ?? null : null;
  const businessName =
    connection.businessName || connection.organization.messageBusinessName || connection.organization.name;

  // Tipo personalizado: o template nunca inclui saudação (instrução na
  // geração por IA, ver notification-type-generator.service.ts) — ela é
  // sempre prefixada aqui, com o estilo/nome escolhidos pelo tenant na
  // criação da função (buildGreeting), pro tom ficar igual ao dos tipos
  // fixos quando configurado assim.
  const baseMessage = builtInType
    ? builtInType.buildMessage({ whatsappName, recipientName: input.recipientName, businessName, details })
    : `${buildGreeting({
        style: customType!.greetingStyle,
        nameSource: customType!.greetingNameSource,
        whatsappName,
        recipientName: input.recipientName,
        details,
        fields: customType!.fields as unknown as CustomNotificationField[],
      })}\n\n${renderCustomMessageTemplate(
        customType!.messageTemplate,
        customType!.fields as unknown as CustomNotificationField[],
        details,
        businessName
      )}`;
  const message = input.note?.trim() ? `${baseMessage}\n\n${input.note.trim()}` : baseMessage;

  // Função personalizada com botões de link (ver custom-link-buttons.ts):
  // vai por send-button-actions; sem botões resolvidos, texto como sempre.
  // Os links continuam no texto (botão não aparece em todo celular).
  const linkButtons = customType && !input.qrData ? resolveLinkButtons(customType.linkButtons, details) : [];
  const buttonsResult =
    !input.qrData && linkButtons.length > 0
      ? await sendTextWithLinkButtons(provider, config, input.to, message, linkButtons)
      : null;
  const result: SendMessageResult = buttonsResult
    ? buttonsResult
    : input.qrData
      ? await provider.sendImage(config, input.to, await QRCode.toDataURL(input.qrData), message)
      : await provider.sendMessage(config, input.to, message);
  if (buttonsResult?.buttonsError) {
    await logBotEvent("warn", "notification.link_buttons_failed", {
      connectionId: connection.id,
      notificationType: resolvedKey,
      via: buttonsResult.via,
      error: buttonsResult.buttonsError,
    });
  }

  // Marca o envio (AuditLog, sem migração) pro silêncio pós-notificação -
  // ver ack-silence.service.ts. Best-effort, nunca lança.
  await recordNotificationSent({
    connectionId: connection.id,
    tenantId: connection.tenantId,
    to: input.to,
    notificationType: resolvedKey,
    result,
  });

  // Depois do recibo de corrida (corrida_concluida ou a função
  // corrida_mai_drive), a divulgação do app depende de ONDE a corrida foi
  // pedida (ver lib/notifications/ride-request-source.ts):
  //  - pelo app do passageiro → não manda nada (ele já tem o app);
  //  - maçaneta / motorista / WhatsApp / sem origem informada → agenda a
  //    imagem com o link da Play Store (3-5 min depois) se o card estiver
  //    ligado; sem o card ligado, cai na Publicidade como antes. Nunca as duas.
  // Nas demais funções a Publicidade segue igual. Nada aqui derruba a
  // resposta do recibo, que já foi enviado.
  const isRideReceipt = isRideReceiptNotificationType(resolvedKey);
  const rideRequestSource = isRideReceipt
    ? resolveRideRequestSource({ requestSource: input.requestSource, details })
    : null;
  let rideAppPromoActive = false;
  if (result.ok && isRideReceipt && rideAllowsPromotions(rideRequestSource)) {
    const followUp = await scheduleRideReceiptFollowUp({
      connectionId: connection.id,
      to: input.to,
      details,
      receiptRaw: result.raw,
    }).catch(async (err) => {
      await logBotEvent("error", "ride_follow_up_schedule_failed", {
        connectionId: connection.id,
        error: serializeError(err),
      });
      return null;
    });
    rideAppPromoActive = followUp?.active === true;
    // Sem cron externo: o próprio recibo dispara o convite no horário
    // (after(), ver scheduleInlineRideFollowUpDispatch).
    if (followUp?.scheduled && followUp.scheduledAt) scheduleInlineRideFollowUpDispatch(followUp.scheduledAt);
  }
  const promotions = planPostNotificationPromotions({
    isRideReceipt,
    source: rideRequestSource,
    appPromoActive: rideAppPromoActive,
  });
  if (result.ok && isRideReceipt && !rideAllowsPromotions(rideRequestSource)) {
    await logBotEvent("info", "ride_promotions_skipped_app_request", {
      connectionId: connection.id,
      notificationType: resolvedKey,
      requestSource: rideRequestSource,
    });
  }

  // Publicidades: depois de um envio com sucesso, põe na fila (after()) no
  // máximo UMA publicidade ativa ligada a esta função. Ela só sai quando o
  // recibo chegar no aparelho (RECEIVED) + 30 s; sem RECEIVED em 30 min,
  // expira. Nunca lança e nunca atrasa esta resposta.
  if (result.ok && promotions.queueAdvertisement) {
    scheduleAdvertisementAfterNotification({
      connectionId: connection.id,
      tenantId: connection.tenantId,
      providerKey: connection.provider.key,
      to: input.to,
      notificationType: resolvedKey,
      receiptMessageId: extractMessageId(result.raw),
    });
  }

  return result;
}

export interface BalanceAlertInput {
  /** Current balance the caller's own external system computed — purely
   * for display in the message text; the threshold decision (when to call
   * this endpoint at all) is entirely the caller's own logic, not ours. */
  saldo?: string;
}

/**
 * Called server-to-server by the tenant's own external wallet/spend-control
 * system whenever its balance drops to whatever threshold *it* decides —
 * same API-key auth as sendPurchaseConfirmation (same key the caller
 * already uses for that), but the destination is deliberately NOT part of
 * the request: it always fans out to the fixed `balanceAlertPhones` list
 * the tenant curated in the dashboard (see updateConnectionBalanceAlertPhones),
 * never to a number the caller supplies.
 */
export async function sendBalanceAlert(
  apiKeyPlaintext: string,
  input: BalanceAlertInput
): Promise<SendMessageResult[]> {
  const connection = await getConnectionByApiKeyHash(hashApiKey(apiKeyPlaintext));
  if (!connection) throw new UnauthorizedError("Chave de API inválida.");
  if (!connection.enabledServices.includes("balance_alert")) {
    throw new ForbiddenError("Este serviço (Alerta de saldo baixo) não está habilitado para esta conexão.");
  }
  if (connection.status !== "CONNECTED") {
    throw new ConflictError("Esta conexão não está ativa no momento.");
  }
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão não está totalmente configurada.");
  }
  if (connection.balanceAlertPhones.length === 0) {
    throw new ConflictError(
      "Nenhum número cadastrado para receber o alerta de saldo baixo. Cadastre ao menos um em Minhas Conexões."
    );
  }

  await touchApiKeyLastUsed(connection.id);

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const config = { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber };

  const message = input.saldo?.trim()
    ? `⚠️ *Saldo baixo*: R$ ${input.saldo.trim()}. Verifique sua carteira.`
    : "⚠️ *Saldo baixo*. Verifique sua carteira.";

  return Promise.all(
    connection.balanceAlertPhones.map(async (phone) => {
      const result = await provider.sendMessage(config, phone, message);
      await recordNotificationSent({
        connectionId: connection.id,
        tenantId: connection.tenantId,
        to: phone,
        notificationType: "balance_alert",
        result,
      });
      return result;
    })
  );
}
